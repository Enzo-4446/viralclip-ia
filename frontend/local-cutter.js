import {FFmpeg} from '@ffmpeg/ffmpeg';
import {toBlobURL} from '@ffmpeg/util';
import {zipSync} from 'fflate';

let engine;
async function getEngine(status) {
  if (engine?.loaded) return engine;
  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({message}) => { if (/error|failed/i.test(message)) console.warn('[ffmpeg local]',message); });
  status('Carregando motor de corte no navegador (primeira execução)...');
  const base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
  await ffmpeg.load({
    coreURL:await toBlobURL(base+'/ffmpeg-core.js','text/javascript'),
    wasmURL:await toBlobURL(base+'/ffmpeg-core.wasm','application/wasm')
  });
  engine=ffmpeg;
  return ffmpeg;
}
function getDuration(file) {
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), video=document.createElement('video');
    video.preload='metadata';
    video.onloadedmetadata=()=>{const n=video.duration;URL.revokeObjectURL(url);Number.isFinite(n)&&n>0?resolve(n):reject(Error('Duração inválida'))};
    video.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Não foi possível ler o MP4'))};
    video.src=url;
  });
}
export async function cutLocally(file,{mode,count,clipDuration,start,duration},status) {
  if(!file||!file.name.toLowerCase().endsWith('.mp4'))throw Error('O corte rápido local requer arquivo MP4.');
  const total=await getDuration(file);
  const segmentLength=mode==='single'?Number(duration):Number(clipDuration);
  const first=mode==='single'?Number(start):0;
  if(!Number.isFinite(first)||first<0||first>=total)throw Error('Início do corte fora da duração do vídeo.');
  if(!Number.isFinite(segmentLength)||segmentLength<=0)throw Error('Duração inválida.');
  const segments=[];
  if(mode==='single')segments.push({start:first,length:Math.min(segmentLength,total-first)});
  else {
    // Cortes sequenciais sem repetições, até a quantidade solicitada.
    for(let t=0; t<total-.2&&segments.length<Number(count);t+=segmentLength)
      segments.push({start:t,length:Math.min(segmentLength,total-t)});
  }
  if(!segments.length)throw Error('Não há trechos para exportar.');
  const ffmpeg=await getEngine(status);
  const input='input_'+Date.now()+'.mp4';
  const outputs=[];
  try {
    status('Preparando arquivo local (nenhum vídeo será enviado ao Render)...');
    await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));
    for(let i=0;i<segments.length;i++){
      const s=segments[i],name='viralclip_'+String(i+1).padStart(2,'0')+'.mp4';
      status('Cortando '+(i+1)+' de '+segments.length+' no seu dispositivo...');
      // Stream copy: sem recodificação, API ou processamento no servidor.
      const code=await ffmpeg.exec(['-ss',String(s.start),'-i',input,'-t',String(s.length),'-map','0:v:0','-map','0:a?','-c','copy','-avoid_negative_ts','make_zero','-movflags','+faststart',name],-1);
      if(code!==0)throw Error('Falha ao cortar trecho '+(i+1)+'. Verifique o codec MP4.');
      const data=await ffmpeg.readFile(name);
      outputs.push({name,bytes:new Uint8Array(data)});
      await ffmpeg.deleteFile(name);
    }
    if(mode==='single')return {blob:new Blob([outputs[0].bytes],{type:'video/mp4'}),files:outputs,zip:false};
    status('Montando ZIP no seu computador...');
    const archive=zipSync(Object.fromEntries(outputs.map(x=>[x.name,x.bytes])),{level:0});
    return {blob:new Blob([archive],{type:'application/zip'}),files:outputs,zip:true};
  } finally {
    for(const o of outputs){try{await ffmpeg.deleteFile(o.name)}catch{}}
    try{await ffmpeg.deleteFile(input)}catch{}
  }
}
