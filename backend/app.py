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
    def cleanup():
        for item in ROOT.glob(prefix+"*"):
            if item.is_file(): item.unlink(missing_ok=True)
    try:
        await __import__("starlette.concurrency",fromlist=["run_in_threadpool"]).run_in_threadpool(download_youtube_with_fallback,canonical,template)
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
