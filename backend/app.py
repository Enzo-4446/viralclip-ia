from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import subprocess, uuid, os, re

app = FastAPI(title="ViralClip IA - protótipo local")
ROOT = Path(os.getenv("MEDIA_DIR", "./media"))
ROOT.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 500 * 1024 * 1024

@app.get("/health")
def health():
    return {"status": "ok", "stage": "local-prototype"}

@app.post("/clips")
async def clips(file: UploadFile = File(...), brand: str = Form("VIRALCLIP"), start: float = Form(0), duration: int = Form(45)):
    if duration not in (45, 60) or start < 0:
        raise HTTPException(400, "Duração deve ser 45 ou 60 segundos e início >= 0")
    if not re.fullmatch(r"[\w @.-]{1,32}", brand, re.UNICODE):
        raise HTTPException(400, "Marca inválida (máximo 32 caracteres)")
    if file.content_type not in ("video/mp4", "video/quicktime", "video/x-matroska"):
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
        # Movimento suave com posição variável ao longo do tempo.
        safe_brand = brand.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        watermark = ("drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
                     f"text='{safe_brand}':fontsize=30:fontcolor=white@0.65:"
                     "borderw=2:bordercolor=black@0.5:"
                     "x=(w-text_w)/2+((w-text_w)/3)*sin(t/3):"
                     "y=(h-text_h)/2+((h-text_h)/3)*cos(t/4)")
        vf = ("scale=1080:1920:force_original_aspect_ratio=increase,"
              "crop=1080:1920,setsar=1," + watermark)
        cmd = ["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
               "-ss",str(start),"-i",str(src),"-t",str(duration),
               "-vf",vf,"-c:v","libx264","-preset","veryfast","-crf","20",
               "-pix_fmt","yuv420p","-r","30","-c:a","aac","-b:a","192k",
               "-movflags","+faststart",str(out)]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode or not out.exists():
            raise HTTPException(422, "Falha na renderização: " + result.stderr[-400:])
        return FileResponse(out, media_type="video/mp4", filename="viralclip.mp4")
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
