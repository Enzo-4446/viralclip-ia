from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pathlib import Path
import subprocess, uuid, os, re, json, math
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ViralClip IA - protótipo local")
allowed_origin = os.getenv("FRONTEND_ORIGIN", "https://enzo-4446.github.io")
if allowed_origin:
    app.add_middleware(CORSMiddleware, allow_origins=[allowed_origin], allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])

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

@app.get("/health")
def health():
    return {"status": "ok", "ffmpeg": subprocess.run(["ffmpeg","-version"],capture_output=True,timeout=5).returncode == 0, "node": subprocess.run(["node","--version"],capture_output=True,text=True,timeout=5).stdout.strip(), "yt_dlp": subprocess.run(["yt-dlp","--version"],capture_output=True,text=True,timeout=5).stdout.strip()}

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
        cmd=["yt-dlp","--js-runtimes","node","--no-playlist","--no-progress","--no-warnings","--max-filesize","500M","--match-filter","!is_live & !was_live","--socket-timeout","20","--retries","2","--fragment-retries","2","--format","bestvideo[height<=720]+bestaudio/best[height<=720]/best","--merge-output-format","mp4","--output",source_template,canonical]
        try:
            p=await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(lambda: subprocess.run(cmd,capture_output=True,text=True,timeout=240))
        except subprocess.TimeoutExpired: raise HTTPException(504,"O YouTube demorou demais para responder")
        if p.returncode:
            raise HTTPException(422,("YouTube exigiu autenticação/verificação humana." if any(x in (p.stderr or "").lower() for x in ("sign in","bot","cookies","confirm you")) else "YouTube recusou o acesso (403/429)." if any(x in (p.stderr or "").lower() for x in ("403","429","forbidden")) else "Falha na transferência do YouTube.")+" Tente outro link ou envie um arquivo autorizado.")
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
    cmd=["yt-dlp","--no-playlist","--skip-download","--dump-single-json","--no-warnings","--socket-timeout","12","--retries","1",canonical]
    try:
        result=await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(lambda: subprocess.run(cmd,capture_output=True,text=True,timeout=40))
    except subprocess.TimeoutExpired:
        return {"status":"unknown","message":"O YouTube não respondeu no prazo. Você pode tentar gerar, mas o acesso não está confirmado."}
    if result.returncode:
        detail=(result.stderr or "").lower()
        if any(k in detail for k in ("sign in","bot","cookies","confirm you")):
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
    cmd=["yt-dlp","--js-runtimes","node","--no-playlist","--no-progress","--no-warnings","--max-filesize","500M","--match-filter","!is_live & !was_live","--socket-timeout","20","--retries","2","--fragment-retries","2","-f","bv*[height<=720]+ba/b[height<=720]/b","--merge-output-format","mp4","--recode-video","mp4","-o",template,canonical]
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
            if any(k in error for k in ("sign in","bot","cookies","confirm you")):
                raise HTTPException(422,"O YouTube exige autenticação do servidor. A prévia incorporada não permite baixar o arquivo.")
            raise HTTPException(422,"O YouTube não disponibilizou o vídeo para transferência neste servidor.")
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
