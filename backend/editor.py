"""Validated FFmpeg export pipeline: framing, quality, narration and optional captions."""
import json, math, os, re, subprocess, tempfile
from pathlib import Path
import httpx

def options(raw):
    try: o=json.loads(raw or '{}')
    except (ValueError,TypeError): raise ValueError('Configuração inválida')
    if not isinstance(o,dict): raise ValueError('Configuração inválida')
    for key,allowed in {'quality':[720,1080],'fps':[30,60],'crf':[17,20,24],'framing':['center','blur'],'captionLanguage':['auto','pt','es','en'],'captionStyle':['dynamic','clean','bold'],'aspect':['9:16','1:1','16:9']}.items():
        if o.get(key,allowed[0]) not in allowed: raise ValueError('Parâmetro inválido: '+key)
    for key,lo,hi in [('originalVolume',0,150),('duckDb',-30,-6),('releaseMs',100,1500)]:
        try: v=float(o.get(key,{'originalVolume':100,'duckDb':-18,'releaseMs':500}[key]))
        except (ValueError,TypeError): raise ValueError('Valor inválido: '+key)
        if not math.isfinite(v) or not lo<=v<=hi: raise ValueError('Valor fora do intervalo: '+key)
    for key in ('captions','ducking','watermark'):
        if key in o and not isinstance(o[key],bool): raise ValueError('Opção inválida: '+key)
    return o

def run(cmd,timeout=600):
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('Falha FFmpeg: '+p.stderr[-350:])
    return p

def has_audio(path):
    p=subprocess.run(['ffprobe','-v','error','-select_streams','a:0','-show_entries','stream=index','-of','csv=p=0',str(path)],capture_output=True,text=True,timeout=15)
    return bool(p.stdout.strip())

def make_vf(o,brand):
    w=int(o.get('quality',1080));aspect=o.get('aspect','9:16');w,h=({'9:16':(w,w*16//9),'1:1':(w,w),'16:9':(w*16//9,w)})[aspect]
    if o.get('framing','center')=='blur':
        vf=f'split=2[bg][fg];[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=30:10[back];[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[front];[back][front]overlay=(W-w)/2:(H-h)/2,setsar=1'
    else: vf=f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1'
    # Brand is inserted through a UTF-8 textfile rather than parsed as filter syntax.
    return vf

def transcribe(video,folder,o):
    key=os.getenv('OPENAI_API_KEY','')
    if not key: raise ValueError('Legendas automáticas requerem OPENAI_API_KEY configurada no Render')
    audio=folder/'speech.mp3'
    run(['ffmpeg','-nostdin','-y','-loglevel','error','-i',str(video),'-vn','-ac','1','-ar','16000','-b:a','64k',str(audio)],180)
    if audio.stat().st_size>24*1024*1024: raise ValueError('Áudio muito longo para transcrição em uma única requisição')
    with audio.open('rb') as f:
        data={'model':'whisper-1','response_format':'verbose_json','timestamp_granularities[]':'segment'}
        if o.get('captionLanguage','auto')!='auto': data['language']=o['captionLanguage']
        try:
            with httpx.Client(timeout=180) as client:
                response=client.post('https://api.openai.com/v1/audio/transcriptions',headers={'Authorization':'Bearer '+key},data=data,files={'file':('speech.mp3',f,'audio/mpeg')})
            response.raise_for_status()
            segments=response.json().get('segments',[])
        except (httpx.HTTPError,ValueError) as e: raise RuntimeError('Transcrição indisponível: '+str(e)[:180])
    if not segments: raise ValueError('Nenhuma fala identificada para legendar')
    return segments

def ass_time(t):
    cs=max(0,round(float(t)*100))
    return f'{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}'

def subtitles(segments,path,o):
    style=o.get('captionStyle','dynamic')
    font_size={'clean':55,'dynamic':68,'bold':76}[style]
    head=f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,DejaVu Sans,{font_size},&H00FFFFFF,&H0000FFFF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,4,2,2,65,65,330,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    lines=[head]
    for seg in segments:
        txt=str(seg.get('text','')).strip().replace('\\','').replace('{','(').replace('}',')').replace('\n',' ')
        if not txt: continue
        # Short lines improve mobile readability.
        words=txt.split()
        for i in range(0,len(words),7):
            start=float(seg['start'])+(float(seg['end'])-float(seg['start']))*i/max(1,len(words))
            end=float(seg['start'])+(float(seg['end'])-float(seg['start']))*min(len(words),i+7)/max(1,len(words))
            lines.append(f'Dialogue: 0,{ass_time(start)},{ass_time(max(end,start+.15))},Default,,0,0,0,,{" ".join(words[i:i+7])}\n')
    path.write_text(''.join(lines),encoding='utf-8')

def render(src,dst,brand,start,duration,raw='{}',voice=None):
    o=options(raw)
    with tempfile.TemporaryDirectory() as td:
        folder=Path(td);base=folder/'base.mp4'
        w=int(o.get('quality',1080));fps=int(o.get('fps',30));crf=int(o.get('crf',20))
        label=folder/'watermark.txt';label.write_text(brand,encoding='utf-8')
        vf=make_vf(o,brand)
        # Textfile path is controlled and has no user-provided syntax.
        draw=f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile={label}:fontsize={max(20,w//32)}:fontcolor=white@0.75:borderw=2:bordercolor=black@0.6:x=(w-text_w)/2:y=h-text_h-{w//9}"
        if o.get('watermark',True):
            vf=vf+','+draw if o.get('framing','center')=='center' else vf+'[v];[v]'+draw
        cmd=['ffmpeg','-nostdin','-y','-hide_banner','-loglevel','error','-ss',str(start),'-i',str(src),'-t',str(duration),'-filter_complex',vf+'[final]','-map','[final]']
        if has_audio(src):cmd+=['-map','0:a:0','-c:a','aac','-b:a','192k']
        else:cmd+=['-an']
        cmd+=['-c:v','libx264','-preset','veryfast','-crf',str(crf),'-pix_fmt','yuv420p','-r',str(fps),'-movflags','+faststart',str(base)]
        run(cmd)
        mixed=base
        if voice is not None:
            audio=folder/'mixed.mp4';vol=float(o.get('originalVolume',100))/100
            original=has_audio(base)
            if original:
                if o.get('ducking',True):
                    # sidechaincompress lowers source under voice, releases after speech.
                    threshold=max(.003,min(.1,10**(float(o.get('duckDb',-18))/20)*.1))
                    release=float(o.get('releaseMs',500))
                    fc=f'[0:a]volume={vol}[orig];[orig][1:a]sidechaincompress=threshold={threshold}:ratio=12:attack=30:release={release}[duck];[duck][1:a]amix=inputs=2:duration=first:normalize=0[a]'
                else:fc=f'[0:a]volume={vol}[orig];[orig][1:a]amix=inputs=2:duration=first:normalize=0[a]'
            else:fc='[1:a]anull[a]'
            run(['ffmpeg','-nostdin','-y','-loglevel','error','-i',str(base),'-i',str(voice),'-filter_complex',fc,'-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-t',str(duration),str(audio)])
            mixed=audio
        if o.get('captions',False):
            segments=transcribe(mixed,folder,o)
            ass=folder/'captions.ass';subtitles(segments,ass,o)
            run(['ffmpeg','-nostdin','-y','-loglevel','error','-i',str(mixed),'-vf',f'ass={ass}','-c:v','libx264','-preset','veryfast','-crf',str(crf),'-c:a','copy','-movflags','+faststart',str(dst)])
        else:
            import shutil
            shutil.copyfile(mixed,dst)
