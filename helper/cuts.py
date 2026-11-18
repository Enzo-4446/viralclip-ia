from pathlib import Path
import json
import subprocess
import zipfile

def duration_of(source: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(source)], capture_output=True, text=True, timeout=30)
    if p.returncode:
        raise ValueError("Arquivo de vídeo inválido")
    duration = float(json.loads(p.stdout)["format"]["duration"])
    if not 0 < duration <= 10800:
        raise ValueError("Vídeo excede o limite de três horas")
    return duration

def cut_video(source: Path, destination: Path, count: int, seconds: int, gap: int, progress=None, cancel=None) -> Path:
    if not (1 <= count <= 50 and 5 <= seconds <= 180 and 0 <= gap <= 600):
        raise ValueError("Parâmetros de corte inválidos")
    total = duration_of(source)
    if count * seconds + (count - 1) * gap > total + 0.001:
        raise ValueError("Os cortes pedidos ultrapassam a duração do vídeo.")
    destination.mkdir(parents=True, exist_ok=True)
    outputs = []
    for i in range(count):
        if cancel and cancel.is_set():
            raise InterruptedError("Processamento cancelado")
        out = destination / f"clip_{i + 1:02d}.mp4"
        start = i * (seconds + gap)
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(start), "-i", str(source), "-t", str(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", str(out)]
        p = subprocess.run(command, capture_output=True, text=True, timeout=900)
        if p.returncode or not out.is_file() or out.stat().st_size == 0:
            raise RuntimeError("Não foi possível gerar um dos cortes")
        outputs.append(out)
        if progress:
            progress({"state": "cutting", "current": i + 1, "total": count})
    archive = destination / "cortes.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as z:
        for path in outputs:
            z.write(path, path.name)
    return archive
