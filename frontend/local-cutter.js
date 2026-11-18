import {renderVideoFrames,originalEncodingProfile,captureHealth} from './video-frames.js';
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
  if(!Number.isFinite(length)||length<=0)throw Error('A duração está vazia ou inválida. No modo automático, escolha de 30 segundos até 2 minutos em “Duração de cada clipe automático”. No modo manual, escolha em “Duração fixa do corte”, abaixo da prévia.');
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
    const alternatives=[30,45,60,90,105,120].filter(seconds=>limit*seconds<=available+1e-6);
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
  for(const mimeType of ['video/mp4','video/mp4;codecs=avc1.42E028,mp4a.40.2','video/webm;codecs=vp8,opus','video/webm']) {
    if(Recorder.isTypeSupported(mimeType)) return {mimeType,extension:mimeType.startsWith('video/mp4')?'mp4':'webm'};
  }
  throw Error('Nenhum formato de exportação local é compatível com este navegador.');
}
export function validateEncodedResolution(blob,width,height,signal) {
  return new Promise((resolve,reject)=>{
    const probe=document.createElement('video'),url=URL.createObjectURL(blob);
    let finished=false;
    const done=error=>{if(finished)return;finished=true;clearTimeout(timer);probe.removeAttribute('src');probe.load();URL.revokeObjectURL(url);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    const abort=()=>done(new DOMException('Corte cancelado.','AbortError'));
    const timer=setTimeout(()=>done(Error('Não consegui conferir o arquivo exportado. Tente gerar novamente; ele não será enviado como concluído sem essa conferência.')),20000);
    probe.preload='metadata';probe.onloadedmetadata=()=>done(probe.videoWidth===width&&probe.videoHeight===height?null:Error('A exportação retornou '+probe.videoWidth+' × '+probe.videoHeight+', mas a entrada é '+width+' × '+height+'. O corte foi recusado para preservar a resolução original.'));
    probe.onerror=()=>done(Error('O navegador gerou um arquivo que não pôde ser aberto. Tente novamente; nenhum vídeo corrompido será enviado à conta.'));
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}probe.src=url;
  });
}
async function recordSegment(video,canvas,stream,segment,format,status,index,total,signal,watermarkText,profile,requestFrame) {
  if(signal.aborted)throw signal.reason;
  video.pause();
  if(Math.abs(video.currentTime-segment.start)>.001){const seek=waitFor(video,'seeked',signal);video.currentTime=segment.start;await seek;}
  if(video.readyState<3)await waitFor(video,'canplay',signal);
  const ctx=canvas.getContext('2d',{alpha:false});
  const recorder=new MediaRecorder(stream,{mimeType:format.mimeType,videoBitsPerSecond:profile.videoBitsPerSecond,audioBitsPerSecond:profile.audioBitsPerSecond});
  const chunks=[],health=captureHealth(segment.start,segment.length);
  return new Promise((resolve,reject)=>{
    let timer,watchdog,stopDrawing=()=>{},lastProgress=0,settled=false,stopping=false,buffering=false,failure;
    const cleanup=()=>{clearInterval(timer);clearTimeout(watchdog);stopDrawing();video.pause();for(const [event,callback] of [['ended',stop],['error',bad],['waiting',waiting],['playing',playing]])video.removeEventListener(event,callback);signal.removeEventListener('abort',abort);};
    const finish=(error,blob)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(blob);};
    const stop=()=>{if(stopping)return;stopping=true;stopDrawing();video.pause();if(recorder.state!=='inactive')recorder.stop();};
    const fail=error=>{failure=error;stop();finish(error);};
    const abort=()=>fail(new DOMException('Corte cancelado.','AbortError'));
    const bad=()=>fail(Error('O vídeo original falhou durante a decodificação. Verifique se esse mesmo trecho toca normalmente fora do site.'));
    const waiting=()=>{if(video.readyState>=3)return;buffering=true;if(recorder.state==='recording')recorder.pause();};
    const playing=()=>{buffering=false;if(recorder.state==='paused')recorder.resume();};
    const draw=time=>{if(settled||stopping)return;try{if(time>=segment.start+segment.length){stop();return;}ctx.drawImage(video,0,0,canvas.width,canvas.height);drawWatermark(ctx,canvas.width,canvas.height,watermarkText,time);requestFrame();health.frame(time);}catch(error){fail(error);}};
    recorder.onpause=()=>{if(!buffering&&!stopping&&recorder.state==='paused')recorder.resume();};
    recorder.onresume=()=>{if(buffering&&!stopping&&recorder.state==='recording')recorder.pause();};
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=e=>fail(e.error||Error('O codificador do navegador falhou. Feche outros vídeos e tente novamente mantendo a resolução original.'));
    recorder.onstop=()=>{try{if(failure)throw failure;health.check();const blob=new Blob(chunks,{type:recorder.mimeType});if(!blob.size)throw Error('O navegador gerou um arquivo vazio. Tente novamente.');finish(null,blob);}catch(error){finish(error);}};
    for(const [event,callback] of [['ended',stop],['error',bad],['waiting',waiting],['playing',playing]])video.addEventListener(event,callback);
    signal.addEventListener('abort',abort,{once:true});
    timer=setInterval(()=>{const elapsed=Math.max(0,video.currentTime-segment.start);if(Date.now()-lastProgress>500){status('Clipe '+(index+1)+' de '+total+' · '+Math.min(100,Math.floor(elapsed/segment.length*100))+'% · '+profile.width+' × '+profile.height+' original'+(buffering?' · aguardando decodificação...':' · mantenha esta aba visível'));lastProgress=Date.now();}if(video.currentTime>=segment.start+segment.length-.01||video.ended)stop();},25);
    watchdog=setTimeout(()=>fail(Error('A decodificação não avançou a tempo. O corte não será salvo com congelamentos. Feche outros vídeos e programas pesados e tente 1 corte.')),(segment.length*3+30)*1000);
    try{recorder.start(1000);draw(video.currentTime);stopDrawing=renderVideoFrames(video,draw);video.play().catch(fail);}catch(error){fail(error);}
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
  video.playsInline=true;video.preload='auto';video.muted=true;video.dataset.localCapture='true';
  video.style.cssText='position:fixed;right:12px;bottom:12px;width:160px;height:90px;pointer-events:none;z-index:1000;background:black;border:1px solid #57617c;border-radius:8px';video.setAttribute('aria-label','Captura do corte em andamento');
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
    const profile=originalEncodingProfile(video.videoWidth,video.videoHeight,file.size,video.duration);
    canvas.width=profile.width;canvas.height=profile.height;
    // Submit a frame only after a new source frame has been decoded.
    stream=canvas.captureStream(0);
    let track=stream.getVideoTracks()[0],requestFrame=()=>track.requestFrame();
    if(typeof track.requestFrame!=='function'){stream.getTracks().forEach(t=>t.stop());stream=canvas.captureStream(60);track=stream.getVideoTracks()[0];requestFrame=()=>{};}
    source=audio.createMediaElementSource(video);
    const destination=audio.createMediaStreamDestination();
    source.connect(destination);
    video.muted=false; // Audio is routed only to the recorder, never to speakers.
    destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
    try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
    const files=[];
    for(let i=0;i<segments.length;i++) {
      report('Preparando clipe '+(i+1)+' de '+segments.length+'...');
      const blob=await recordSegment(video,canvas,stream,segments[i],format,report,i,segments.length,controller.signal,options.watermark?options.brand:'',profile,requestFrame);
      report('Conferindo resolução original do clipe '+(i+1)+'...');
      await validateEncodedResolution(blob,profile.width,profile.height,controller.signal);
      files.push({name:'viralclip_'+String(i+1).padStart(2,'0')+'.'+format.extension,blob,type:blob.type});
    }
    if(options.mode==='single'&&files.length===1)return {blob:files[0].blob,files,zip:false,extension:format.extension,notice:''};
    if(files.reduce((sum,file)=>sum+file.blob.size,0)>64*1024*1024)return {blob:null,files,zip:false,extension:format.extension,notice:'Cortes de alta qualidade disponíveis individualmente. ZIP automático omitido para evitar sobrecarga de memória.'};
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





