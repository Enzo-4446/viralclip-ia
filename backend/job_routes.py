"""Bounded background rendering with user-scoped progress and downloads."""
import asyncio, json, os, subprocess, time, uuid, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Header
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

def require_job_user(authorization: str = Header(default="")):
    from app import require_user
    return require_user(authorization)

router=APIRouter()
POOL=ThreadPoolExecutor(max_workers=1)
LOCK=threading.Lock()
JOBS={}
ROOT=Path(os.getenv("MEDIA_DIR","./media"))
ROOT.mkdir(parents=True,exist_ok=True)
MAX_BYTES=500*1024*1024
TTL=3600

def _clean(job):
    for key in ("source","output","voice"):
        path=job.get(key)
        if path:
            Path(path).unlink(missing_ok=True)

def _render(job_id):
    from editor import render
    from batch import render_batch
    with LOCK:
        job=JOBS[job_id]
        job["state"]="processing"
        job["stage"]="Renderizando clipes com FFmpeg"
    try:
        if job["mode"]=="batch":
            render_batch(job["source"],job["output"],job["brand"],10,job["settings"],job.get("voice"))
        else:
            render(job["source"],job["output"],job["brand"],job["start"],job["duration"],job["settings"],job.get("voice"))
        with LOCK:
            job["state"]="finished"
            job["stage"]="Arquivo pronto"
    except Exception as exc:
        with LOCK:
            job["state"]="failed"
            job["stage"]="Falha no processamento"
            job["error"]=str(exc)[-350:]
        _clean(job)
    finally:
        Path(job["source"]).unlink(missing_ok=True)
        if job.get("voice"):Path(job["voice"]).unlink(missing_ok=True)

def _expire():
    now=time.time()
    with LOCK:
        expired=[k for k,v in JOBS.items() if v["state"] in ("finished","failed") and now-v["created"]>TTL]
        for k in expired:_clean(JOBS.pop(k))

@router.post("/jobs/upload")
async def start_upload(file:UploadFile=File(...),mode:str=Form("batch"),brand:str=Form("VIRALCLIP"),settings:str=Form("{}"),start:float=Form(0),duration:int=Form(30),voice:UploadFile|None=File(None),user:dict=Depends(require_job_user)):
    # Authentication dependency is injected by app.include_router(dependencies=...).
    from editor import options
    if mode not in ("batch","single"):raise HTTPException(400,"Modo inválido")
    if file.content_type not in ("video/mp4","video/quicktime","video/x-matroska","video/webm","application/octet-stream"):raise HTTPException(415,"Formato inválido")
    if duration not in (30,45,60,90) or start<0:raise HTTPException(400,"Intervalo inválido")
    try:options(settings)
    except ValueError as exc:raise HTTPException(400,str(exc))
    _expire()
    with LOCK:
        if sum(v["state"] in ("queued","processing") for v in JOBS.values())>=2:
            raise HTTPException(429,"Servidor ocupado. Aguarde a conclusão da tarefa atual.")
    jid=uuid.uuid4().hex
    src=ROOT/(jid+".input")
    output=ROOT/(jid+(".zip" if mode=="batch" else ".mp4"))
    total=0
    try:
        with src.open("wb") as dest:
            while chunk:=await file.read(1024*1024):
                total+=len(chunk)
                if total>MAX_BYTES:raise HTTPException(413,"Arquivo acima de 500 MB")
                dest.write(chunk)
        narration=None
        if voice:
            narration=ROOT/(jid+".voice")
            size=0
            with narration.open("wb") as dest:
                while chunk:=await voice.read(1024*1024):
                    size+=len(chunk)
                    if size>50*1024*1024:raise HTTPException(413,"Narração acima de 50 MB")
                    dest.write(chunk)
        job={"id":jid,"user_id":user["id"],"state":"queued","stage":"Aguardando processamento","created":time.time(),"source":str(src),"output":str(output),"voice":str(narration) if narration else None,"mode":mode,"brand":brand,"settings":settings,"start":start,"duration":duration,"error":None}
        with LOCK:JOBS[jid]=job
        POOL.submit(_render,jid)
        return {"job_id":jid,"state":"queued"}
    except Exception:
        src.unlink(missing_ok=True)
        if narration:narration.unlink(missing_ok=True)
        raise

def _owned(jid,user):
    _expire()
    with LOCK:
        job=JOBS.get(jid)
        if not job:raise HTTPException(404,"Tarefa não encontrada ou expirada")
        if job["user_id"]!=user["id"]:raise HTTPException(403,"Sem acesso")
        return job.copy()

@router.get("/jobs/{jid}")
def status(jid:str,user:dict=Depends(require_job_user)):
    job=_owned(jid,user)
    return {k:job[k] for k in ("job_id","state","stage","error") if k in job} | {"job_id":jid}

@router.get("/jobs/{jid}/download")
def download(jid:str,user:dict=Depends(require_job_user)):
    job=_owned(jid,user)
    if job["state"]!="finished":raise HTTPException(409,"Tarefa ainda não concluída")
    output=Path(job["output"])
    if not output.exists():raise HTTPException(410,"Arquivo não está mais disponível")
    return FileResponse(output,media_type="application/zip" if job["mode"]=="batch" else "video/mp4",filename="viralclip_cortes.zip" if job["mode"]=="batch" else "viralclip.mp4")

@router.delete("/jobs/{jid}")
def cancel(jid:str,user:dict=Depends(require_job_user)):
    job=_owned(jid,user)
    if job["state"] in ("queued","processing"):
        raise HTTPException(409,"Não é possível interromper uma renderização já iniciada")
    with LOCK:JOBS.pop(jid,None)
    _clean(job)
    return {"deleted":True}
