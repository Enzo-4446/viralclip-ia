import {drawWatermark} from './watermark.js';
import {zipSync} from 'fflate';

// Native media pipeline: no WASM, remote encoder or video upload.
export function planSegments(total,{mode,count,clipDuration,start,end,duration,selections,trimStart=10,trimEnd=10}) {
  if(!Number.isFinite(total))throw Error('Não consegui ler a duração do vídeo. Em “Enviar vídeo”, selecione o arquivo novamente e aguarde a prévia carregar. Se a prévia não abrir, tente outro arquivo MP4.');
  const ignoredStart=Number(trimStart),ignoredEnd=Number(trimEnd);
  if(!Number.isFinite(ignoredStart)||!Number.isFinite(ignoredEnd)||ignoredStart<0||ignoredEnd<0)throw Error('Em “Ignorar no início” e “Ignorar no final”, digite uma quantidade de segundos igual ou maior que 0. Use 0 para não ignorar nada.');
  if(total<=ignoredStart+ignoredEnd)throw Error('Seu vídeo tem '+total.toFixed(1)+'s, mas você escolheu ignorar '+ignoredStart+'s do início e '+ignoredEnd+'s do final. Reduza esses dois valores; use 0 e 0 para aproveitar o vídeo completo.');
  if(!['single','batch'].includes(mode))throw Error('Modo de corte inválido.');
  const first=Math.max(ignoredStart,start==null||start===''?ignoredStart:Number(start));
  const last=Math.min(total-ignoredEnd,end==null||end===''?total-ignoredEnd:Number(end));
  if(!Number.isFinite(first)||!Number.isFinite(last)||first>=last){
    const error=Error('O início e o final escolhidos não formam um intervalo para cortar.\nSeu vídeo tem '+total.toFixed(1)+' segundos. Depois de ignorar '+ignoredStart+'s do início e '+ignoredEnd+'s do final, você pode usar de '+ignoredStart+' até '+(total-ignoredEnd).toFixed(1)+' segundos.\nValores preenchidos: “Começar em” = '+(start==null||start===''?'vazio':String(start))+'; “Terminar em” = '+(end==null||end===''?'vazio (automático)':String(end))+'.\nComo corrigir:\n1. Em “Começar em (segundos)”, digite '+ignoredStart+'.\n2. Em “Terminar em (segundos, opcional)”, apague o valor e deixe vazio.\n3. Confira a quantidade e a duração dos clipes e clique em “Gerar clipes” novamente.\nVocê também pode clicar em “Usar intervalo completo permitido” abaixo.');
    error.resetRange=true;throw error;
  }
  const length=Number(mode==='single'?duration:clipDuration);
  if(!Number.isFinite(length)||length<=0)throw Error('A duração está vazia ou inválida. No modo automático, escolha 30, 45 ou 60 segundos em “Duração de cada clipe automático”. No modo manual, escolha em “Duração fixa do corte”, abaixo da prévia.');
  if(mode==='single'&&selections?.length) {
    if(selections.length>10)throw Error('Selecione no máximo 10 trechos por vez.');
    return selections.map((item,index)=>{
      const offset=Number(item.start);
      if(!Number.isFinite(offset)||offset<first||offset+length>last+1e-6)throw Error('O trecho '+(index+1)+' começa em '+String(item.start)+'s e precisa de '+length+'s, mas ele deve ficar entre '+first.toFixed(1)+'s e '+last.toFixed(1)+'s.\nComo corrigir: '+(last-first>=length?'na seleção abaixo da prévia, arraste o início para um ponto entre '+first.toFixed(1)+'s e '+(last-length).toFixed(1)+'s.':'escolha uma duração menor; este intervalo tem somente '+(last-first).toFixed(1)+'s úteis.')+' Se o trecho já estiver na lista, clique em “Remover” nele e adicione a seleção corrigida.');
      return {start:offset,length};
    });
  }
  const limit=mode==='single'?1:Number(count);
  if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('Escolha de 1 a 10 clipes.');
  if(limit*length>last-first+1e-6){
    const available=last-first,capacity=Math.floor(available/length);
    const alternatives=[30,45,60].filter(seconds=>limit*seconds<=available+1e-6);
    throw Error('Você pediu '+limit+' clipe(s) de '+length+'s: são necessários '+(limit*length)+'s.\nO intervalo escolhido vai de '+first.toFixed(1)+'s até '+last.toFixed(1)+'s, tem '+available.toFixed(1)+'s úteis e comporta '+capacity+' clipe(s) de '+length+'s.\nComo corrigir:\n'+(capacity>0?'• Em “Quantidade de clipes”, escolha '+capacity+' ou menos, mantendo '+length+' segundos.':'• Este intervalo não comporta nem 1 clipe de '+length+'s. Escolha uma duração menor ou um vídeo mais longo.')+'\n'+(alternatives.length?'• Para manter '+limit+' clipe(s), em “Duração de cada clipe automático”, escolha '+alternatives.join(' ou ')+' segundos.':'• Para manter essa quantidade e duração, selecione um vídeo maior ou amplie o intervalo usando “Começar em” = '+ignoredStart+' e “Terminar em” vazio. Você também pode reduzir “Ignorar no início” e “Ignorar no final”.')+'\nA duração dos cortes não será encurtada automaticamente.');
  }
  return Array.from({length:limit},(_,i)=>({start:first+i*length,length}));
}
function waitFor(target,event,signal,timeout=30000) {
  return new Promise((resolve,reject)=>{
    const finish=(error)=>{clearTimeout(timer);target.removeEventListener(event,ok);target.removeEventListener('error',bad);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    const ok=()=>finish(),bad=()=>finish(Error('O navegador não conseguiu decodificar este vídeo. Tente MP4 com vídeo H.264 e áudio AAC.'));
    const abort=()=>finish(new DOMException('Corte cancelado.','AbortError'));
    const timer=setTimeout(()=>finish(Error('A prévia do vídeo não respondeu em 30 segundos. Aguarde o arquivo carregar, feche outros programas pesados e selecione o vídeo novamente em “Enviar vídeo”.')),timeout);
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
async function recordSegment(video,canvas,stream,segment,format,status,index,total,signal,watermarkText) {
  if(signal.aborted) throw signal.reason;
  video.pause();
  if(Math.abs(video.currentTime-segment.start)>.001) {
    const seek=waitFor(video,'seeked',signal);
    video.currentTime=segment.start;
    await seek;
  }
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.drawImage(video,0,0,canvas.width,canvas.height);drawWatermark(ctx,canvas.width,canvas.height,watermarkText,video.currentTime);
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
    const draw=()=>{if(settled||recorder.state==='inactive')return;ctx.drawImage(video,0,0,canvas.width,canvas.height);drawWatermark(ctx,canvas.width,canvas.height,watermarkText,video.currentTime);frame=requestAnimationFrame(draw);};
    video.addEventListener('ended',stop);video.addEventListener('error',bad);signal.addEventListener('abort',abort,{once:true});
    timer=setInterval(()=>{
      const elapsed=Math.max(0,video.currentTime-segment.start);
      if(Date.now()-lastProgress>500){status('Clipe '+(index+1)+' de '+total+' · '+Math.min(100,Math.floor(elapsed/segment.length*100))+'% · mantenha esta aba visível');lastProgress=Date.now();}
      if(video.currentTime>=segment.start+segment.length-.025||video.ended)stop();
    },25);
    watchdog=setTimeout(()=>fail(Error('A reprodução travou. Deixe esta aba do ViralClip aberta e visível, evite suspender o computador e clique em “Gerar clipes” novamente. Para testar, escolha 1 clipe de 30 segundos.')),(segment.length*2+30)*1000);
    try{recorder.start(1000);draw();video.play().catch(fail);}catch(e){fail(e);}
  });
}
let busy=false;
export async function cutLocally(file,options,status=()=>{},signal=new AbortController().signal) {
  if(busy) throw Error('Já existe um corte em andamento.');
  const format=recordingFormat();
  if(options.watermark&&!options.brand?.trim())throw Error('Informe o nome da marca d’água.');
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
    if(options.watermark)await document.fonts.load('650 16px "Manrope Variable"');
    const ready=waitFor(video,'loadeddata',controller.signal);
    video.src=url;video.load();await ready;
    const segments=planSegments(video.duration,options);
    const report=status;
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
      const blob=await recordSegment(video,canvas,stream,segments[i],format,report,i,segments.length,controller.signal,options.watermark?options.brand:'');
      files.push({name:'viralclip_'+String(i+1).padStart(2,'0')+'.'+format.extension,blob,type:blob.type});
    }
    if(options.mode==='single'&&files.length===1)return {blob:files[0].blob,files,zip:false,extension:format.extension,notice:''};
    status('Montando ZIP local...');
    const entries={};
    for(const item of files)entries[item.name]=new Uint8Array(await item.blob.arrayBuffer());
    const archive=zipSync(entries,{level:0});
    return {blob:new Blob([archive],{type:'application/zip'}),files,zip:true,extension:format.extension,notice:'Os segundos que você escolheu ignorar foram excluídos. Duração escolhida preservada.'};
  } catch(error) {
    if(controller.signal.aborted)throw new DOMException(document.hidden?'O corte parou porque a aba ficou oculta. Volte para a aba do ViralClip, clique em “Gerar clipes” novamente e mantenha-a visível até terminar.':'Corte cancelado.','AbortError');
    throw error;
  } finally {
    video.pause();video.removeAttribute('src');video.load();video.remove();
    stream?.getTracks().forEach(track=>track.stop());source?.disconnect();
    try{await audio?.close();}catch{}
    try{await wakeLock?.release();}catch{}
    URL.revokeObjectURL(url);signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',visibility);busy=false;
  }
}




