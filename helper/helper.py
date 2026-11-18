"""VIRAL IA local helper. Start with: python helper.py"""
import asyncio
import hmac
import json
import os
import sys
import secrets
import shutil
import threading
import time
import uuid
from pathlib import Path

import uvicorn
import yt_dlp
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from cuts import cut_video
from security import canonical_youtube_url
from ytdl import download, DownloadError

HOST = "127.0.0.1"
PORTS = range(47800, 47811)
ALLOWED = {"https://enzo-4446.github.io"}
if os.getenv("VIRAL_HELPER_DEV") == "1":
    ALLOWED.update({"http://localhost:5173", "http://127.0.0.1:5173"})
PIN = f"{secrets.randbelow(1000000):06d}"
TOKEN = secrets.token_urlsafe(32)
PIN_EXPIRES = time.monotonic() + 600
PAIR_ATTEMPTS = 0
PAIR_LOCK = threading.Lock()
JOBS = {}
JOB_LOCK = threading.Lock()
OUTPUT = Path.home() / "ViralIA"
OUTPUT.mkdir(parents=True, exist_ok=True)
if getattr(sys, "frozen", False):
    bundled = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    os.environ["PATH"] = str(bundled) + os.pathsep + os.environ.get("PATH", "")

app = FastAPI(title="VIRAL IA Helper", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware, allow_origins=sorted(ALLOWED),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def reject_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin not in ALLOWED:
        return JSONResponse(status_code=403, content={"detail": "Origem não autorizada"})
    if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network") == "true":
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response
    response = await call_next(request)
    if request.method == "OPTIONS":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

def require_token(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer ") or not hmac.compare_digest(authorization[7:], TOKEN):
        raise HTTPException(401, "Pareamento necessário")

class PairBody(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")

class ClipSettings(BaseModel):
    count: int = Field(ge=1, le=50)
    seconds: int = Field(ge=5, le=180)
    gap: int = Field(ge=0, le=600)

class JobBody(BaseModel):
    url: str
    clips: ClipSettings
    rights_declared: bool

@app.get("/health")
def health():
    return {"ok": True, "version": "0.1.0", "ytdlp_version": yt_dlp.version.__version__, "ffmpeg_ok": shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None}

@app.post("/pair")
def pair(body: PairBody):
    global PAIR_ATTEMPTS
    with PAIR_LOCK:
        PAIR_ATTEMPTS += 1
        if time.monotonic() > PIN_EXPIRES or PAIR_ATTEMPTS > 5:
            raise HTTPException(429, "Reinicie o Helper para gerar um novo código")
        if not hmac.compare_digest(body.code, PIN):
            raise HTTPException(401, "Código inválido")
    return {"token": TOKEN}

def update(job_id, **fields):
    with JOB_LOCK:
        JOBS[job_id].update(fields)

def run_job(job_id, url, settings):
    work = OUTPUT / job_id
    work.mkdir(parents=True, exist_ok=True)
    def progress(data):
        update(job_id, **data)
    try:
        update(job_id, state="downloading")
        source = download(url, work, progress, JOBS[job_id]["cancel"])
        if JOBS[job_id]["cancel"].is_set():
            raise InterruptedError("Processamento cancelado")
        update(job_id, state="cutting")
        archive = cut_video(source, work / "cortes", settings.count, settings.seconds, settings.gap, progress, JOBS[job_id]["cancel"])
        update(job_id, state="done", folder=str(archive.parent), archive=str(archive))
    except (DownloadError, InterruptedError, ValueError, RuntimeError) as exc:
        message = str(exc)
        if "cancelado" not in message.lower() and not isinstance(exc, ValueError):
            message = message if isinstance(exc, DownloadError) else "Falha ao processar o vídeo."
        update(job_id, state="error", message=message)
    except Exception:
        update(job_id, state="error", message="Falha inesperada no processamento.")
    finally:
        for temporary in work.glob("source.*"):
            if temporary.is_file():
                temporary.unlink(missing_ok=True)

@app.post("/jobs", status_code=202)
def create_job(body: JobBody, authorization: str | None = Header(default=None)):
    require_token(authorization)
    if not body.rights_declared:
        raise HTTPException(400, "Confirme seus direitos sobre o conteúdo")
    try:
        canonical = canonical_youtube_url(body.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise HTTPException(503, "FFmpeg não encontrado. Instale o FFmpeg antes de continuar.")
    with JOB_LOCK:
        if any(j["state"] not in ("done", "error") for j in JOBS.values()):
            raise HTTPException(409, "Já existe uma importação em andamento")
        job_id = uuid.uuid4().hex
        JOBS[job_id] = {"state": "queued", "cancel": threading.Event(), "created": time.monotonic()}
    threading.Thread(target=run_job, args=(job_id, canonical, body.clips), daemon=True).start()
    return {"id": job_id}

@app.get("/jobs/{job_id}/events")
async def events(job_id: str, authorization: str | None = Header(default=None)):
    require_token(authorization)
    if job_id not in JOBS:
        raise HTTPException(404, "Job não encontrado")
    async def stream():
        previous = None
        for _ in range(3600):
            with JOB_LOCK:
                job = JOBS.get(job_id)
                payload = {k: v for k, v in job.items() if k not in ("cancel", "created", "folder", "archive")}
            encoded = json.dumps(payload, ensure_ascii=False)
            if encoded != previous:
                yield "data: " + encoded + "\n\n"
                previous = encoded
            if payload["state"] in ("done", "error"):
                break
            await asyncio.sleep(1)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})

@app.post("/jobs/{job_id}/cancel")
def cancel(job_id: str, authorization: str | None = Header(default=None)):
    require_token(authorization)
    with JOB_LOCK:
        if job_id not in JOBS:
            raise HTTPException(404, "Job não encontrado")
        JOBS[job_id]["cancel"].set()
    return {"ok": True}

@app.post("/open-folder")
def open_folder(authorization: str | None = Header(default=None)):
    require_token(authorization)
    # Opening folders from browser-origin requests is deliberately disabled.
    # The output path is shown in the helper terminal to avoid local-app launch abuse.
    return {"ok": False, "message": "Abra a pasta ViralIA no diretório pessoal do computador."}

if __name__ == "__main__":
    import socket
    def port_available(port):
        with socket.socket() as sock:
            return sock.connect_ex((HOST, port)) != 0
    port = next((p for p in PORTS if port_available(p)), None)
    if port is None:
        raise SystemExit("Nenhuma porta disponível")
    print("\nVIRAL IA HELPER")
    print("Código de pareamento (válido por 10 minutos):", PIN)
    print("Pasta dos vídeos:", OUTPUT)
    print("Acesse pelo navegador a página oficial do VIRAL IA.\n")
    uvicorn.run(app, host=HOST, port=port, access_log=False)
