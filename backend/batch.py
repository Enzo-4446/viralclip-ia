"""Batch clipping foundation: scene-boundary suggestions, MP4 export and ZIP manifest.
Scores are heuristic, not an AI prediction of virality.
"""
import json, math, re, subprocess, tempfile, zipfile
from pathlib import Path

def probe(path):
    p=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","json",str(path)],capture_output=True,text=True,timeout=20)
    if p.returncode: raise ValueError("Não foi possível ler a duração do vídeo")
    duration=float(json.loads(p.stdout)["format"]["duration"])
    if not math.isfinite(duration) or duration<12: raise ValueError("Vídeo precisa ter pelo menos 12 segundos")
    return duration

def scene_times(path, duration):
    # Scene detection is content-based; no transcript or emotion inference is claimed.
    cmd=["ffmpeg","-hide_banner","-nostdin","-i",str(path),"-vf","scale=320:-2,select=gt(scene\\,0.30),showinfo","-an","-f","null","-"]
    try:
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=120)
        times=[float(v) for v in re.findall(r"pts_time:([0-9.]+)",p.stderr)]
        return sorted(set(t for t in times if 0<t<duration))
    except (subprocess.TimeoutExpired,ValueError):
        return []

def suggest(duration, scenes, count=10):
    # Distribute selections across the entire source to reduce repeated content.
    length=min(30.,max(12.,duration/(count*1.15)))
    if duration<length*2: count=max(1,int(duration//length))
    slots=max(1,count)
    results=[]
    for i in range(slots):
        target=(duration-length)*i/max(1,slots-1) if slots>1 else 0
        nearby=[t for t in scenes if abs(t-target)<=min(7,length/3) and t+length<=duration]
        start=min(nearby,key=lambda t:abs(t-target)) if nearby else target
        start=max(0,min(start,duration-length))
        # This is a structural score only; it is NOT a viral probability.
        score=round(55+25*(1-abs(start-target)/max(1,length)) + (10 if nearby else 0))
        results.append({"index":i+1,"start":round(start,2),"duration":round(length,2),"structural_score":min(90,score)})
    return results

def render_batch(src, output_zip, brand, max_count=10, settings="{}", voice=None):
    duration=probe(src)
    scenes=scene_times(src,duration)
    segments=suggest(duration,scenes,max_count)
    with tempfile.TemporaryDirectory() as folder:
        folder=Path(folder)
        manifest={"method":"scene-boundary heuristic (not AI semantic analysis)","source_duration":round(duration,2),"clips":segments}
        for item in segments:
            target=folder/f"viralclip_{item['index']:02d}.mp4"
            from editor import render
            render(src,target,brand,item["start"],item["duration"],settings,voice)
        with zipfile.ZipFile(output_zip,"w",zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("analise.json",json.dumps(manifest,ensure_ascii=False,indent=2))
            for item in segments: archive.write(folder/f"viralclip_{item['index']:02d}.mp4",f"viralclip_{item['index']:02d}.mp4")
    return manifest
