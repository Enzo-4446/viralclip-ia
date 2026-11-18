from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pathlib import Path
import subprocess, uuid, os, re, json, math
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ViralClip IA - protótipo local")
allowed_origins = list(dict.fromkeys(["https://enzo-4446.github.io"] + [x.strip().rstrip("/") for x in os.getenv("FRONTEND_ORIGIN", "").split(",") if x.strip()]))
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_methods=["GET", "POST", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"], max_age=600)

# Commercial release safety switch: all legacy export routes are disabled in
# commercial mode until they are integrated with a trusted wallet settlement.
# This gate runs BEFORE any file processing, including async job submission.
COMMERCIAL_ENFORCEMENT = os.getenv("COMMERCIAL_ENFORCEMENT", "off").strip().lower()
LEGACY_EXPORT_PATHS = frozenset({
    "/clips", "/clips/batch", "/clips/youtube",
    "/youtube/download", "/media/import", "/jobs/upload"
})
if COMMERCIAL_ENFORCEMENT not in ("off", "strict"):
    raise RuntimeError("COMMERCIAL_ENFORCEMENT must be 'off' or 'strict'")

@app.middleware("http")
async def commercial_export_gate(request, call_next):
    path = request.url.path.rstrip("/") or "/"
    if COMMERCIAL_ENFORCEMENT == "strict" and path in LEGACY_EXPORT_PATHS:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"detail":"Exportação comercial temporariamente indisponível. Nenhum crédito foi cobrado."},
            headers={"Cache-Control":"no-store"}
        )
    return await call_next(request)


def require_user(authorization: str = Header(default="")):
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        raise HTTPException(503, "Autenticação não configurada no servidor")
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Autenticação necessária")
    token = authorization[7:]
    try:
        req = Request(base + "/auth/v1/user", headers={"apikey": key, "Authorization": "Bearer " + token})
        with urlopen(req, timeout=8) as response:
            user = json.loads(response.read(65536))
        if not user.get("id"):
            raise HTTPException(401, "Sessão inválida")
        user["access_token"] = token
        return user
    except HTTPError:
        raise HTTPException(401, "Sessão inválida ou expirada")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Serviço de autenticação indisponível")

ROOT = Path(os.getenv("MEDIA_DIR", "./media"))
ROOT.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 500 * 1024 * 1024

@app.get("/capabilities")
def capabilities(user: dict = Depends(require_user)):
    return {"captions":bool(os.getenv("OPENAI_API_KEY")),"ffmpeg":True}

@app.get("/health")
def health():
    return {"status": "ok", "youtube_pot_provider": os.path.isfile("/opt/bgutil/server/build/main.js"), "ffmpeg": subprocess.run(["ffmpeg","-version"],capture_output=True,timeout=5).returncode == 0, "node": subprocess.run(["node","--version"],capture_output=True,text=True,timeout=5).stdout.strip(), "yt_dlp": subprocess.run(["yt-dlp","--version"],capture_output=True,text=True,timeout=5).stdout.strip()}

@app.post("/clips")
async def clips(file: UploadFile = File(...), brand: str = Form("VIRALCLIP"), start: float = Form(0), duration: int = Form(45), project_id: str = Form(""), settings: str = Form("{}"), voice: UploadFile | None = File(None), user: dict = Depends(require_user)):
    if duration not in (30, 45, 60, 90) or not math.isfinite(start) or start < 0:
        raise HTTPException(400, "Duração deve ser 30, 45, 60 ou 90 segundos e início >= 0")
    if not re.fullmatch(r"[\w @.-]{1,32}", brand, re.UNICODE):
        raise HTTPException(400, "Marca inválida (máximo 32 caracteres)")
    if file.content_type not in ("video/mp4", "video/quicktime", "video/x-matroska", "video/webm"):
        raise HTTPException(415, "Formato de vídeo não suportado")
    job = uuid.uuid4().hex
    src, out = ROOT / f"{job}.input", ROOT / f"{job}.mp4"
    total = 0
    try:
        with src.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise HTTPException(413, "Vídeo acima do limite de 500 MB")
                target.write(chunk)
        from editor import render, options
        try: options(settings)
        except ValueError as e: raise HTTPException(400,str(e))
        narration=None
        if voice is not None:
            narration=ROOT/f"{job}.voice"
            size=0
            with narration.open("wb") as target:
                while chunk:=await voice.read(1024*1024):
                    size+=len(chunk)
                    if size>50*1024*1024: raise HTTPException(413,"Narração acima de 50 MB")
                    target.write(chunk)
        try:
            await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(render,src,out,brand,start,duration,settings,narration)
        except (ValueError,RuntimeError) as e: raise HTTPException(422,str(e))
        finally:
            if narration: narration.unlink(missing_ok=True)
        return FileResponse(out, media_type="video/mp4", filename="viralclip.mp4", background=BackgroundTask(out.unlink, missing_ok=True))
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Tempo de renderização excedido")
    finally:
        src.unlink(missing_ok=True)


# The MVP is intentionally local-only. Add authentication, job isolation and quotas
# before exposing it to the public internet.
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request
import json

@app.get("/")
def home():
    return FileResponse(Path(__file__).with_name("index.html"), media_type="text/html")

@app.get("/youtube/metadata")
def youtube_metadata(url: str):
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    video_id = None
    if host in ("youtube.com", "www.youtube.com", "m.youtube.com") and parsed.path == "/watch":
        video_id = parse_qs(parsed.query).get("v", [None])[0]
    elif host in ("youtu.be", "www.youtu.be"):
        video_id = parsed.path.strip("/")
    elif host in ("youtube.com", "www.youtube.com") and parsed.path.startswith("/shorts/"):
        video_id = parsed.path.split("/")[2]
    if parsed.scheme != "https" or not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise HTTPException(400, "Informe um link válido de vídeo do YouTube")
    canonical = "https://www.youtube.com/watch?v=" + video_id
    endpoint = "https://www.youtube.com/oembed?url=" + canonical + "&format=json"
    try:
        req = Request(endpoint, headers={"User-Agent": "ViralClipIA/0.1"})
        with urlopen(req, timeout=8) as response:
            data = json.loads(response.read(16384))
        return {"title": data.get("title"), "author_name": data.get("author_name"), "url": canonical, "download_available": False}
    except Exception:
        raise HTTPException(404, "Metadados indisponíveis; confira se o vídeo é público")

# Batch mode: authenticated upload, ownership check and ten scene-aware exports.
@app.post("/clips/batch")
async def batch_clips(file: UploadFile = File(...), brand: str = Form("VIRALCLIP"), project_id: str = Form(""), settings: str = Form("{}"), voice: UploadFile | None = File(None), user: dict = Depends(require_user)):
    from batch import render_batch
    if not re.fullmatch(r"[\w @.-]{1,32}", brand, re.UNICODE):
        raise HTTPException(400, "Marca inválida")
    if file.content_type not in ("video/mp4","video/quicktime","video/x-matroska","video/webm"):
        raise HTTPException(415, "Formato de vídeo não suportado")
    job=uuid.uuid4().hex
    src=ROOT/(job+".input")
    output=ROOT/(job+".zip")
    try:
        size=0
        with src.open("wb") as dest:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>MAX_BYTES: raise HTTPException(413,"Arquivo acima de 500 MB")
                dest.write(chunk)
        from editor import options
        try: options(settings)
        except ValueError as e: raise HTTPException(400,str(e))
        narration=None
        if voice is not None:
            narration=ROOT/(job+".voice")
            total_voice=0
            with narration.open("wb") as target:
                while chunk:=await voice.read(1024*1024):
                    total_voice+=len(chunk)
                    if total_voice>50*1024*1024: raise HTTPException(413,"Narração acima de 50 MB")
                    target.write(chunk)
        try:
            await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(render_batch,src,output,brand,10,settings,narration)
        except ValueError as exc:
            raise HTTPException(422,str(exc))
        except (RuntimeError,subprocess.TimeoutExpired) as exc:
            raise HTTPException(500,"Erro ao produzir os cortes: "+str(exc)[:300])
        return FileResponse(output,media_type="application/zip",filename="viralclip_10_cortes.zip",background=BackgroundTask(output.unlink,missing_ok=True))
    finally:
        src.unlink(missing_ok=True)
        narration_path=ROOT/(job+".voice")
        narration_path.unlink(missing_ok=True)

# Optional YouTube input for videos that the uploader owns or is authorized to process.
# Public YouTube streams are not guaranteed accessible on hosted servers.
def youtube_pot_args():
    """Use the installed yt-dlp PO-token provider when available."""
    script="/opt/bgutil/server"
    if os.path.isfile(script+"/build/main.js"):
        return ["--extractor-args","youtube:player_client=mweb",
                "--extractor-args","youtubepot-bgutilscript:server_home="+script]
    return []


def youtube_error_kind(stderr):
    """Classify restrictions without suggesting a successful human-check bypass."""
    detail=(stderr or "").lower()
    if any(k in detail for k in ("sign in", "not a bot", "confirm you", "cookies", "verify you are human")):
        return "verification_required"
    if any(k in detail for k in ("private video", "members-only", "age-restricted", "copyright", "not available in your country")):
        return "restricted"
    if any(k in detail for k in ("403", "429", "forbidden", "too many requests")):
        return "rate_limited"
    return "unavailable"


def youtube_error_message(stderr):
    kind=youtube_error_kind(stderr)
    return {
        "verification_required": "O YouTube exige verificação humana ou uma sessão autorizada. O servidor não pode concluir essa verificação automaticamente. Baixe seu vídeo pela sua conta e envie o MP4.",
        "restricted": "O vídeo tem restrições de acesso. Utilize um arquivo obtido com autorização.",
        "rate_limited": "O YouTube limitou o acesso deste servidor. Aguarde ou envie o MP4 autorizado.",
        "unavailable": "O vídeo não pôde ser transferido. Confira se é público e acessível ou envie o MP4."
    }[kind]


def youtube_download_command(canonical, template, *, metadata=False):
    """A bounded, public-video attempt with consistent extraction configuration."""
    cmd=["yt-dlp","--js-runtimes","node","--no-playlist","--no-progress",
         "--no-warnings","--socket-timeout","20","--retries","2",
         "--fragment-retries","2"]
    cmd.extend(youtube_pot_args())
    if metadata:
        cmd.extend(["--skip-download","--dump-single-json"])
    else:
        cmd.extend(["--max-filesize","500M","--match-filter","!is_live & !was_live",
                    "-f","bv*[height<=720]+ba/b[height<=720]/b",
                    "--merge-output-format","mp4","-o",template])
    cmd.append(canonical)
    return cmd

@app.post("/clips/youtube")
async def youtube_clips(url: str = Form(...), project_id: str = Form(""), brand: str = Form("VIRALCLIP"), settings: str = Form("{}"), rights_confirmed: bool = Form(False), user: dict = Depends(require_user)):
    from editor import options
    from batch import render_batch
    if not rights_confirmed:
        raise HTTPException(400,"Confirme que possui direitos para processar o vídeo")
    if not re.fullmatch(r"[\w @.-]{1,32}",brand,re.UNICODE):
        raise HTTPException(400,"Marca inválida")
    try: options(settings)
    except ValueError as e: raise HTTPException(400,str(e))
    parsed=urlparse(url)
    host=(parsed.hostname or "").lower()
    if parsed.scheme!="https" or parsed.port not in (None,443) or parsed.username or parsed.password or host not in ("youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtu.be"):
        raise HTTPException(400,"Utilize um link HTTPS válido do YouTube")
    video_id=(parse_qs(parsed.query).get("v",[None])[0] if parsed.path=="/watch" else parsed.path.strip("/").split("/")[-1])
    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}",video_id):
        raise HTTPException(400,"Identificador do vídeo inválido")
    canonical="https://www.youtube.com/watch?v="+video_id
    job=uuid.uuid4().hex
    src=ROOT/(job+".source.mp4");out=ROOT/(job+".zip")
    source_template=str(ROOT/(job+".source.%(ext)s"))
    try:
        # Restricted, single-item, bounded transfer. yt-dlp may fail when YouTube restricts access.
        cmd=youtube_download_command(canonical,source_template)
        try:
            p=await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(lambda: subprocess.run(cmd,capture_output=True,text=True,timeout=240))
        except subprocess.TimeoutExpired: raise HTTPException(504,"O YouTube demorou demais para responder")
        if p.returncode:
            raise HTTPException(422,youtube_error_message(p.stderr))
        candidates=[p for p in ROOT.glob(job+".source.*") if p.is_file() and not p.name.endswith((".part",".ytdl"))]
        if not candidates: raise HTTPException(422,"Arquivo de vídeo não encontrado após transferência")
        src=candidates[0]
        if src.stat().st_size>MAX_BYTES: raise HTTPException(413,"Vídeo acima do limite de 500 MB")
        try:
            await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(render_batch,src,out,brand,10,settings,None)
        except (ValueError,RuntimeError,subprocess.TimeoutExpired) as e:
            raise HTTPException(422,"Falha ao gerar cortes: "+str(e)[:250])
        return FileResponse(out,media_type="application/zip",filename="viralclip_youtube.zip",background=BackgroundTask(out.unlink,missing_ok=True))
    finally:
        for temporary in ROOT.glob(job+".source.*"):
            temporary.unlink(missing_ok=True)

@app.post("/youtube/check")
async def check_youtube(url: str = Form(...), user: dict = Depends(require_user)):
    """Preflight only: metadata availability does not guarantee stream download."""
    parsed=urlparse(url)
    host=(parsed.hostname or "").lower()
    if parsed.scheme!="https" or parsed.port not in (None,443) or parsed.username or parsed.password or host not in ("youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtu.be"):
        raise HTTPException(400,"Cole uma URL HTTPS válida do YouTube")
    video_id=(parse_qs(parsed.query).get("v",[None])[0] if parsed.path=="/watch" else parsed.path.strip("/").split("/")[-1])
    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}",video_id):
        raise HTTPException(400,"Identificador do vídeo inválido")
    canonical="https://www.youtube.com/watch?v="+video_id
    cmd=youtube_download_command(canonical,None,metadata=True)
    try:
        result=await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(lambda: subprocess.run(cmd,capture_output=True,text=True,timeout=40))
    except subprocess.TimeoutExpired:
        return {"status":"unknown","message":"O YouTube não respondeu no prazo. Você pode tentar gerar, mas o acesso não está confirmado."}
    if result.returncode:
        detail=(result.stderr or "").lower()
        if youtube_error_kind(detail)=="verification_required":
            msg="O YouTube exigiu autenticação/verificação humana do servidor. A geração por link provavelmente falhará."
        elif "private" in detail or "unavailable" in detail:
            msg="Vídeo indisponível ou privado para este servidor."
        else:
            msg="Não foi possível confirmar acesso ao vídeo. A geração pode falhar."
        return {"status":"blocked","message":msg}
    try:
        info=json.loads(result.stdout)
    except (ValueError,TypeError):
        return {"status":"unknown","message":"Metadados incompletos. A transferência não está confirmada."}
    if info.get("is_live") or info.get("live_status")=="is_live":
        return {"status":"blocked","message":"Lives em andamento não são suportadas. Use a gravação após o encerramento."}
    return {"status":"available","title":str(info.get("title") or "")[:160],"duration":info.get("duration"),"message":"Metadados acessíveis ao servidor. Você pode clicar em Gerar clipes; a transferência completa ainda pode ser bloqueada."}


@app.post("/youtube/download")
async def youtube_download(url: str = Form(...), rights_confirmed: bool = Form(False), user: dict = Depends(require_user)):
    """Download an accessible authorized YouTube video as MP4 for local editing."""
    if not rights_confirmed:
        raise HTTPException(400,"Confirme que possui autorização para editar o vídeo")
    parsed=urlparse(url)
    host=(parsed.hostname or "").lower()
    if parsed.scheme!="https" or parsed.port not in (None,443) or parsed.username or parsed.password or host not in ("youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtu.be"):
        raise HTTPException(400,"URL HTTPS do YouTube inválida")
    video_id=(parse_qs(parsed.query).get("v",[None])[0] if parsed.path=="/watch" else parsed.path.strip("/").split("/")[-1])
    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}",video_id):
        raise HTTPException(400,"ID do vídeo inválido")
    job=uuid.uuid4().hex
    prefix=job+".download."
    template=str(ROOT/(prefix+"%(ext)s"))
    canonical="https://www.youtube.com/watch?v="+video_id
    cmd=youtube_download_command(canonical,template)
    def cleanup():
        for item in ROOT.glob(prefix+"*"):
            if item.is_file(): item.unlink(missing_ok=True)
    try:
        try:
            proc=await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(lambda:subprocess.run(cmd,capture_output=True,text=True,timeout=240))
        except subprocess.TimeoutExpired:
            raise HTTPException(504,"Tempo de transferência excedido")
        if proc.returncode:
            error=(proc.stderr or "").lower()
            # Embedded client only works for videos the uploader allows embedding.
            # A second extraction attempt can help with client-specific format failures,
            # but cannot override account, copyright or IP restrictions.
            if not any(k in error for k in ("sign in","not a bot","confirm you","private video","age-restricted","copyright")):
                fallback=cmd[:]
                fallback[1:1]=["--extractor-args","youtube:player_client=web_embedded"]
                try:
                    proc=await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(lambda:subprocess.run(fallback,capture_output=True,text=True,timeout=120))
                    error=(proc.stderr or "").lower()
                except subprocess.TimeoutExpired:
                    raise HTTPException(504,"O YouTube não respondeu na tentativa alternativa")
        if proc.returncode:
            error=(proc.stderr or "").lower()
            if any(k in error for k in ("sign in","bot","cookies","confirm you")):
                raise HTTPException(422,youtube_error_message(proc.stderr))
            raise HTTPException(422,youtube_error_message(proc.stderr))
        files=[p for p in ROOT.glob(prefix+"*") if p.is_file() and p.suffix==".mp4"]
        if not files:
            raise HTTPException(422,"Não foi possível produzir um arquivo MP4")
        source=files[0]
        if source.stat().st_size>MAX_BYTES:
            raise HTTPException(413,"Vídeo excede 500 MB")
        return FileResponse(source,media_type="video/mp4",filename="viralclip_fonte_"+video_id+".mp4",background=BackgroundTask(cleanup))
    except Exception:
        cleanup()
        raise


@app.post("/media/import")
async def import_media(url: str = Form(...), user: dict = Depends(require_user)):
    """Import authorized direct MP4 links from explicitly approved storage hosts."""
    import httpx
    from urllib.parse import urlsplit
    parsed=urlsplit(url)
    hostname=(parsed.hostname or "").lower()
    allowed={host.strip().lower() for host in os.getenv("MEDIA_SOURCE_HOSTS","").split(",") if host.strip()}
    if parsed.scheme!="https" or parsed.username or parsed.password or parsed.port not in (None,443) or hostname not in allowed or not allowed:
        raise HTTPException(400,"Origem não autorizada. Configure MEDIA_SOURCE_HOSTS com o domínio de armazenamento confiável.")
    job=uuid.uuid4().hex
    target=ROOT/(job+".mp4")
    try:
        async with httpx.AsyncClient(follow_redirects=False,timeout=httpx.Timeout(30.0,read=45.0)) as client:
            async with client.stream("GET",url) as response:
                if response.status_code!=200:
                    raise HTTPException(422,"O link não disponibilizou o arquivo diretamente (HTTP "+str(response.status_code)+").")
                content_type=response.headers.get("content-type","").split(";")[0].strip().lower()
                if content_type not in ("video/mp4","application/octet-stream"):
                    raise HTTPException(415,"O link não retornou um MP4 direto.")
                total=0
                with target.open("wb") as output:
                    async for chunk in response.aiter_bytes(1024*1024):
                        total+=len(chunk)
                        if total>MAX_BYTES: raise HTTPException(413,"Vídeo acima de 500 MB")
                        output.write(chunk)
        if total<1024: raise HTTPException(422,"Arquivo vazio ou inválido.")
        probe=subprocess.run(["ffprobe","-v","error","-select_streams","v:0","-show_entries","stream=codec_type","-of","default=noprint_wrappers=1",str(target)],capture_output=True,text=True,timeout=20)
        if probe.returncode or "codec_type=video" not in probe.stdout:
            raise HTTPException(422,"O arquivo não contém um vídeo válido.")
        return FileResponse(target,media_type="video/mp4",filename="viralclip_importado.mp4",background=BackgroundTask(target.unlink,missing_ok=True))
    except Exception:
        target.unlink(missing_ok=True)
        raise


# Job-based upload pipeline inspired by ClipForge: bounded queue, observable state.
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
import time
from fastapi.responses import JSONResponse

_job_pool=ThreadPoolExecutor(max_workers=1)
_job_lock=Lock()
_jobs={}
_JOB_TTL=3600

def _job_cleanup():
    now=time.time()
    with _job_lock:
        expired=[k for k,v in _jobs.items() if now-v["created"]>_JOB_TTL and v["state"] in ("done","failed")]
        for k in expired:
            entry=_jobs.pop(k)
            for p in entry["paths"]:
                Path(p).unlink(missing_ok=True)

def _render_job(job_id,src,out,brand,settings,voice,mode,start,duration):
    with _job_lock: _jobs[job_id].update(state="rendering",message="FFmpeg processando o vídeo")
    try:
        if mode=="batch":
            from batch import render_batch
            render_batch(src,out,brand,10,settings,voice)
        else:
            from editor import render
            render(src,out,brand,start,duration,settings,voice)
        if not out.exists() or out.stat().st_size==0: raise RuntimeError("O renderizador não produziu arquivo")
        with _job_lock: _jobs[job_id].update(state="done",message="Arquivo pronto para baixar")
    except Exception as e:
        with _job_lock: _jobs[job_id].update(state="failed",message=str(e)[:350])
    finally:
        src.unlink(missing_ok=True)
        if voice: voice.unlink(missing_ok=True)

@app.post("/jobs/upload",status_code=202)
async def submit_upload_job(file:UploadFile=File(...),brand:str=Form("VIRALCLIP"),settings:str=Form("{}"),mode:str=Form("batch"),start:float=Form(0),duration:int=Form(30),voice:UploadFile|None=File(None),user:dict=Depends(require_user)):
    from editor import options
    _job_cleanup()
    if mode not in ("single","batch"): raise HTTPException(400,"Modo inválido")
    if not re.fullmatch(r"[\w @.-]{1,32}",brand,re.UNICODE): raise HTTPException(400,"Marca inválida")
    if mode=="single" and (duration not in (30,45,60,90) or not math.isfinite(start) or start<0): raise HTTPException(400,"Corte inválido")
    if file.content_type not in ("video/mp4","video/quicktime","video/x-matroska","video/webm","application/octet-stream"): raise HTTPException(415,"Formato não suportado")
    try: options(settings)
    except ValueError as e: raise HTTPException(400,str(e))
    with _job_lock:
        active=sum(v["state"] in ("queued","rendering") for v in _jobs.values())
    if active>=2: raise HTTPException(429,"Servidor ocupado. Aguarde a tarefa anterior terminar.")
    job_id=uuid.uuid4().hex
    src=ROOT/(job_id+".input");out=ROOT/(job_id+(".zip" if mode=="batch" else ".mp4"))
    voice_path=None
    try:
        size=0
        with src.open("wb") as dest:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>MAX_BYTES: raise HTTPException(413,"Arquivo acima de 500 MB")
                dest.write(chunk)
        if voice:
            voice_path=ROOT/(job_id+".voice")
            size=0
            with voice_path.open("wb") as dest:
                while chunk:=await voice.read(1024*1024):
                    size+=len(chunk)
                    if size>50*1024*1024: raise HTTPException(413,"Narração acima de 50 MB")
                    dest.write(chunk)
        with _job_lock:
            _jobs[job_id]={"user":user["id"],"state":"queued","message":"Aguardando processamento","created":time.time(),"paths":[str(src),str(out)]+([str(voice_path)] if voice_path else []),"output":str(out),"mode":mode}
        _job_pool.submit(_render_job,job_id,src,out,brand,settings,voice_path,mode,start,duration)
        return {"job_id":job_id,"state":"queued"}
    except Exception:
        src.unlink(missing_ok=True)
        if voice_path: voice_path.unlink(missing_ok=True)
        raise

@app.get("/jobs/{job_id}")
def job_status(job_id:str,user:dict=Depends(require_user)):
    _job_cleanup()
    with _job_lock:
        job=_jobs.get(job_id)
        if not job or job["user"]!=user["id"]: raise HTTPException(404,"Tarefa não encontrada")
        return {"state":job["state"],"message":job["message"],"download_url":"/jobs/"+job_id+"/download" if job["state"]=="done" else None}

@app.get("/jobs/{job_id}/download")
def job_download(job_id:str,user:dict=Depends(require_user)):
    with _job_lock:
        job=_jobs.get(job_id)
        if not job or job["user"]!=user["id"]: raise HTTPException(404,"Tarefa não encontrada")
        if job["state"]!="done": raise HTTPException(409,"Arquivo ainda não está pronto")
        output=Path(job["output"]);mode=job["mode"]
    if not output.is_file(): raise HTTPException(410,"Arquivo expirado")
    return FileResponse(output,media_type="application/zip" if mode=="batch" else "video/mp4",filename="viralclip_cortes.zip" if mode=="batch" else "viralclip.mp4")

from job_routes import router as jobs_router
app.include_router(jobs_router)
