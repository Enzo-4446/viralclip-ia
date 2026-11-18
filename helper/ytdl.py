from pathlib import Path
import time
import yt_dlp

class DownloadError(Exception):
    pass

def friendly_error(message: str) -> str:
    s = message.lower()
    if any(x in s for x in ("sign in", "not a bot", "confirm you", "403", "429", "cookies")):
        return "O YouTube restringiu o acesso a este vídeo agora. Tente novamente mais tarde ou envie o arquivo original."
    if any(x in s for x in ("private video", "age-restricted", "members-only", "unavailable")):
        return "Este vídeo não está acessível sem login. Envie o arquivo original."
    return "Não foi possível importar o vídeo. Envie o arquivo original."

def download(url: str, folder: Path, progress=None, cancel=None) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    opts = {
        "format": "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]",
        "merge_output_format": "mp4",
        "outtmpl": str(folder / "source.%(ext)s"),
        "noplaylist": True, "socket_timeout": 30, "retries": 2,
        "fragment_retries": 2, "max_filesize": 2 * 1024**3,
        "quiet": True, "no_warnings": True,
    }
    def hook(info):
        if cancel and cancel.is_set():
            raise DownloadError("Processamento cancelado")
        if info.get("status") == "downloading" and progress:
            size = info.get("total_bytes") or info.get("total_bytes_estimate") or 0
            if size > 2 * 1024**3:
                raise DownloadError("O arquivo passa do limite de 2 GB.")
            if size:
                progress({"state": "downloading", "percent": round(100 * info.get("downloaded_bytes", 0) / size, 1)})
    opts["progress_hooks"] = [hook]
    last_error = ""
    for attempt in range(2):
        if cancel and cancel.is_set():
            raise DownloadError("Processamento cancelado")
        if attempt:
            time.sleep(5)
        try:
            with yt_dlp.YoutubeDL(opts) as client:
                client.download([url])
            source = folder / "source.mp4"
            if not source.exists():
                raise DownloadError("Arquivo MP4 não produzido")
            if source.stat().st_size > 2 * 1024**3:
                raise DownloadError("O arquivo passa do limite de 2 GB.")
            return source
        except Exception as exc:
            last_error = str(exc)
            if any(x in last_error.lower() for x in ("sign in", "not a bot", "confirm you", "private video", "age-restricted", "403", "429")):
                break
    raise DownloadError(friendly_error(last_error))
