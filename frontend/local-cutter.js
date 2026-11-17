import {zipSync} from 'fflate';

// Native media pipeline: no WASM, remote encoder or video upload.
export function planSegments(total,{mode,count,clipDuration,start=0,end,duration}) {
  if (!Number.isFinite(total)||total<=0) throw Error('Não foi possível determinar a duração do vídeo.');
  if (!['single','batch'].includes(mode)) throw Error('Modo de corte inválido.');
  const length=Number(mode==='single'?duration:clipDuration);
  const first=Number(start);
  const last=end==null||end===''?total:Number(end);
  if(!Number.isFinite(last)||last<=first||last>total)throw Error('O final deve ser maior que o início e não ultrapassar a duração do vídeo.');
  const available=last-first;
  if (!Number.isFinite(length)||length<=0) throw Error('Escolha uma duração maior que zero.');
  if (!Number.isFinite(first)||first<0||first>=total) throw Error('O início está fora da duração do vídeo.');
  const limit=mode==='single'?1:Number(count);
  if (!Number.isInteger(limit)||limit<1||limit>10) throw Error('Escolha de 1 a 10 clipes.');
  // Honor the requested count. Short sources are divided into shorter, distinct clips.
  const step=mode==='batch'?Math.min(length,available/limit):length;
  if(mode==='batch'&&step<.5)throw Error('Vídeo muito curto para '+limit+' clipes. Reduza a quantidade.');
  const segments=[];
  for(let i=0;i<limit;i++) {
    const offset=first+i*step;
    segments.push({start:offset,length:Math.min(step,last-offset)});
  }
  return segments;
}
function waitFor(target,event,signal,timeout=30000) {
  return new Promise((resolve,reject)=>{
    const finish=(error)=>{clearTimeout(timer);target.removeEventListener(event,ok);target.removeEventListener('error',bad);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    const ok=()=>finish(),bad=()=>finish(Error('O navegador não conseguiu decodificar este vídeo. Tente MP4 com vídeo H.264 e áudio AAC.'));
    const abort=()=>finish(new DOMException('Corte cancelado.','AbortError'));
    const timer=setTimeout(()=>finish(Error('O vídeo demorou demais para responder.')),timeout);
    target.addEventListener(event,ok,{once:true});target.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted) abort();
  });
}
export function recordingFormat(Recorder=globalThis.MediaRecorder) {
  if(!Recorder) throw Error('Este navegador não oferece gravação local. Abra no Chrome, Edge ou Safari atualizado.');
  for(const mimeType of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm']) {
    if(Recorder.isTypeSupported(mimeType)) return {mimeType,extension:mimeType.startsWith('video/mp4')?'mp4':'webm'};
  }
  throw Error('Nenhum formato de exportação local é compatível com este navegador.');
}
async function recordSegment(video,canvas,stream,segment,format,status,index,total,signal) {
  if(signal.aborted) throw signal.reason;
  video.pause();
  if(Math.abs(video.currentTime-segment.start)>.001) {
    const seek=waitFor(video,'seeked',signal);
    video.currentTime=segment.start;
    await seek;
  }
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const recorder=new MediaRecorder(stream,{mimeType:format.mimeType,videoBitsPerSecond:5000000,audioBitsPerSecond:128000});
  const chunks=[];
  return new Promise((resolve,reject)=>{
    let timer,watchdog,frame,lastProgress=0,settled=false,failure;
    const cleanup=()=>{clearInterval(timer);clearTimeout(watchdog);cancelAnimationFrame(frame);video.pause();video.removeEventListener('ended',stop);video.removeEventListener('error',bad);signal.removeEventListener('abort',abort);};
    const finish=(error,blob)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(blob);};
    const stop=()=>{video.pause();if(recorder.state!=='inactive')recorder.stop();};
    const fail=e=>{failure=e;stop();finish(e);};
    const abort=()=>fail(new DOMException('Corte cancelado.','AbortError'));
    const bad=()=>fail(Error('Falha ao ler o vídeo durante o corte.'));
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=e=>fail(e.error||Error('Falha na gravação local.'));
    recorder.onstop=()=>{const blob=new Blob(chunks,{type:recorder.mimeType});finish(failure||(!blob.size?Error('O navegador gerou um clipe vazio.'):null),blob);};
    const draw=()=>{if(settled||recorder.state==='inactive')return;ctx.drawImage(video,0,0,canvas.width,canvas.height);frame=requestAnimationFrame(draw);};
    video.addEventListener('ended',stop);video.addEventListener('error',bad);signal.addEventListener('abort',abort,{once:true});
    timer=setInterval(()=>{
      const elapsed=Math.max(0,video.currentTime-segment.start);
      if(Date.now()-lastProgress>500){status('Clipe '+(index+1)+' de '+total+' · '+Math.min(100,Math.floor(elapsed/segment.length*100))+'% · mantenha esta aba visível');lastProgress=Date.now();}
      if(video.currentTime>=segment.start+segment.length-.025||video.ended)stop();
    },25);
    watchdog=setTimeout(()=>fail(Error('A reprodução travou. Mantenha a aba visível e tente novamente.')),(segment.length*2+30)*1000);
    try{recorder.start(1000);draw();video.play().catch(fail);}catch(e){fail(e);}
  });
}
let busy=false;
export async function cutLocally(file,options,status=()=>{},signal=new AbortController().signal) {
  if(busy) throw Error('Já existe um corte em andamento.');
  const format=recordingFormat();
  if(!file?.size) throw Error('Selecione um vídeo que não esteja vazio.');
  if(!HTMLCanvasElement.prototype.captureStream) throw Error('Este navegador não permite exportar o vídeo localmente. Use Chrome ou Edge no computador.');
  busy=true;
  let audio,source,stream,wakeLock;
  const video=document.createElement('video'),canvas=document.createElement('canvas');
  const url=URL.createObjectURL(file);
  const controller=new AbortController();
  const abort=()=>controller.abort();
  const visibility=()=>{if(document.hidden)controller.abort();};
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)controller.abort();
  document.addEventListener('visibilitychange',visibility);
  video.playsInline=true;video.preload='auto';video.muted=true;
  video.style.cssText='position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none';
  document.body.append(video);
  try {
    // Resume audio immediately in the initiating user action.
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio) throw Error('Áudio local indisponível neste navegador.');
    audio=new Audio();
    await audio.resume();
    if(audio.state!=='running')throw Error('O navegador bloqueou o áudio. Clique em Gerar novamente.');
    const ready=waitFor(video,'loadeddata',controller.signal);
    video.src=url;video.load();await ready;
    const segments=planSegments(video.duration,options);
    const shortened=options.mode==='batch'&&segments[0].length<Number(options.clipDuration)-.01;
    const report=message=>status((shortened?'Intervalo selecionado de '+((options.end==null||options.end===''?video.duration:Number(options.end))-Number(options.start||0)).toFixed(1)+'s: '+segments.length+' clipes de aproximadamente '+segments[0].length.toFixed(1)+'s (ajustados para não repetir trechos). ':'')+message);
    // Limit recording to 1080p to avoid excessive encoder memory on mobile.
    const scale=Math.min(1,1080/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.max(2,Math.round(video.videoWidth*scale/2)*2);
    canvas.height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
    stream=canvas.captureStream(30);
    source=audio.createMediaElementSource(video);
    const destination=audio.createMediaStreamDestination();
    source.connect(destination);
    video.muted=false; // Audio is routed only to the recorder, never to speakers.
    destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
    try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
    const files=[];
    for(let i=0;i<segments.length;i++) {
      report('Preparando clipe '+(i+1)+' de '+segments.length+'...');
      const blob=await recordSegment(video,canvas,stream,segments[i],format,report,i,segments.length,controller.signal);
      files.push({name:'viralclip_'+String(i+1).padStart(2,'0')+'.'+format.extension,blob,type:blob.type});
    }
    if(options.mode==='single')return {blob:files[0].blob,files,zip:false,extension:format.extension,notice:''};
    status('Montando ZIP local...');
    const entries={};
    for(const item of files)entries[item.name]=new Uint8Array(await item.blob.arrayBuffer());
    const archive=zipSync(entries,{level:0});
    return {blob:new Blob([archive],{type:'application/zip'}),files,zip:true,extension:format.extension,notice:shortened?'Duração ajustada para aproximadamente '+segments[0].length.toFixed(1)+' segundos por clipe, sem repetir trechos.':''};
  } catch(error) {
    if(controller.signal.aborted)throw new DOMException(document.hidden?'Corte interrompido: mantenha a aba visível durante a exportação.':'Corte cancelado.','AbortError');
    throw error;
  } finally {
    video.pause();video.removeAttribute('src');video.load();video.remove();
    stream?.getTracks().forEach(track=>track.stop());source?.disconnect();
    try{await audio?.close();}catch{}
    try{await wakeLock?.release();}catch{}
    URL.revokeObjectURL(url);signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',visibility);busy=false;
  }
}
