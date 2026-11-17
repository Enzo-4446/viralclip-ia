from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pathlib import Path
import subprocess, uuid, os, re, json, math
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ViralClip IA - protótipo local")
allowed_origin = os.getenv("FRONTEND_ORIGIN", "")
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
    return {"status": "ok", "ffmpeg": subprocess.run(["ffmpeg","-version"],capture_output=True,timeout=5).returncode == 0}

@app.post("/clips")
async def clips(file: UploadFile = File(...), brand: str = Form("VIRALCLIP"), start: float = Form(0), duration: int = Form(45), project_id: str = Form(...), settings: str = Form("{}"), voice: UploadFile | None = File(None), user: dict = Depends(require_user)):
    try:
        uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(400, "ID de projeto inválido")
    if duration not in (30, 45, 60, 90) or not math.isfinite(start) or start < 0:
        raise HTTPException(400, "Duração deve ser 30, 45, 60 ou 90 segundos e início >= 0")
    if not re.fullmatch(r"[\w @.-]{1,32}", brand, re.UNICODE):
        raise HTTPException(400, "Marca inválida (máximo 32 caracteres)")
    if file.content_type not in ("video/mp4", "video/quicktime", "video/x-matroska", "video/webm"):
        raise HTTPException(415, "Formato de vídeo não suportado")
    # Check project ownership through the user's JWT and Supabase RLS.
    # Project ownership is enforced by Supabase on creation; no project data is fetched here.
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    endpoint = base + "/rest/v1/clip_projects?id=eq." + project_id + "&user_id=eq." + user["id"] + "&select=id&limit=1"
    req = Request(endpoint, headers={"apikey": key, "Authorization": "Bearer " + user["access_token"]})
    try:
        with urlopen(req, timeout=8) as response:
            records = json.loads(response.read(4096))
        if not records:
            raise HTTPException(403, "Projeto não pertence ao usuário")
    except HTTPError:
        raise HTTPException(503, "Falha ao verificar propriedade do projeto")
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
async def batch_clips(file: UploadFile = File(...), brand: str = Form("VIRALCLIP"), project_id: str = Form(...), settings: str = Form("{}"), voice: UploadFile | None = File(None), user: dict = Depends(require_user)):
    from batch import render_batch
    try:
        uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(400, "ID de projeto inválido")
    if not re.fullmatch(r"[\\w @.-]{1,32}", brand, re.UNICODE):
        raise HTTPException(400, "Marca inválida")
    if file.content_type not in ("video/mp4","video/quicktime","video/x-matroska","video/webm"):
        raise HTTPException(415, "Formato de vídeo não suportado")
    base=os.environ["SUPABASE_URL"].rstrip("/")
    key=os.environ["SUPABASE_PUBLISHABLE_KEY"]
    endpoint=base+"/rest/v1/clip_projects?id=eq."+project_id+"&user_id=eq."+user["id"]+"&select=id&limit=1"
    try:
        req=Request(endpoint,headers={"apikey":key,"Authorization":"Bearer "+user["access_token"]})
        with urlopen(req,timeout=8) as response:
            records=json.loads(response.read(4096))
        if not records: raise HTTPException(403,"Projeto não pertence ao usuário")
    except HTTPError:
        raise HTTPException(503,"Não foi possível verificar o projeto")
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
