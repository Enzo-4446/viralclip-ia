import re
from urllib.parse import urlsplit, parse_qs

HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

def canonical_youtube_url(value: str) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Link inválido")
    try:
        u = urlsplit(value)
        if u.scheme != "https" or u.username or u.password or u.port not in (None, 443) or (u.hostname or "").lower() not in HOSTS or u.fragment:
            raise ValueError("Link inválido")
        if "list" in parse_qs(u.query):
            raise ValueError("Playlists não são suportadas")
        host = u.hostname.lower()
        if host == "youtu.be":
            parts = u.path.strip("/").split("/")
            vid = parts[0] if len(parts) == 1 else None
        elif u.path == "/watch":
            values = parse_qs(u.query).get("v", [])
            vid = values[0] if len(values) == 1 else None
        else:
            match = re.fullmatch(r"/shorts/([A-Za-z0-9_-]{11})/?", u.path)
            vid = match.group(1) if match else None
        if not vid or not VIDEO_ID.fullmatch(vid):
            raise ValueError("ID inválido")
        return "https://www.youtube.com/watch?v=" + vid
    except (ValueError, TypeError) as exc:
        raise ValueError("Informe uma URL HTTPS válida de vídeo do YouTube") from exc
