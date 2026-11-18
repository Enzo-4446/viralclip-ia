import {Input,ALL_FORMATS,BlobSource,Output,BufferTarget,Mp4OutputFormat,Conversion,Quality,EncodedPacketSink} from 'mediabunny';
import {drawWatermark} from './watermark.js';
import {originalEncodingProfile} from './video-frames.js';
const aborted=signal=>{if(signal?.aborted)throw new DOMException('Corte cancelado.','AbortError');};
export async function openOfflineInput(file){
  const input=new Input({formats:ALL_FORMATS,source:new BlobSource(file)});
  try{
    const video=await input.getPrimaryVideoTrack();
    if(!video)throw Error('Este arquivo não contém uma faixa de vídeo. Selecione outro arquivo.');
    const [width,height,duration,audio]=await Promise.all([video.getDisplayWidth(),video.getDisplayHeight(),input.computeDuration(),input.getPrimaryAudioTrack()]);
    return {input,video,audio,width,height,duration,dispose:()=>input.dispose()};
  }catch(error){input.dispose();throw error;}
}
export function assertOfflineTimeline(expected,actual,tolerance=.003){
  if(!expected.length||expected.length!==actual.length)throw Error('A codificação não preservou todos os quadros do trecho. Tente novamente; nenhum corte incompleto foi salvo.');
  const source=expected.map(x=>x.time).sort((a,b)=>a-b),result=actual.map(x=>x.time).sort((a,b)=>a-b);
  for(let i=0;i<source.length;i++)if(Math.abs(source[i]-result[i])>tolerance)throw Error('A codificação alterou o tempo de um quadro. O arquivo não será salvo com essa falha de sincronização.');
}
export function createOfflineProcessor({width,height,watermark,brand,start=0,frames,createCanvas=(w,h)=>typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h})}){
  let context=null;
  return sample=>{
    if(sample.displayWidth!==width||sample.displayHeight!==height)throw Error('A resolução de um quadro mudou durante o corte. O arquivo não será reduzido automaticamente.');
    frames.push({time:sample.timestamp,duration:sample.duration});
    if(!watermark)return sample;
    if(!context){const canvas=createCanvas(width,height);context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('Não foi possível preparar a marca d’água neste navegador.');}
    sample.draw(context,0,0,width,height);
    drawWatermark(context,width,height,brand,start+sample.timestamp);
    return context.canvas;
  };
}
export async function inspectOfflineOutput(blob,{width,height,frames,needsAudio,length}){
  const input=new Input({formats:ALL_FORMATS,source:new BlobSource(blob)});
  try{
    const video=await input.getPrimaryVideoTrack();if(!video)throw Error('O arquivo gerado ficou sem vídeo.');
    const [actualWidth,actualHeight,audio,duration]=await Promise.all([video.getDisplayWidth(),video.getDisplayHeight(),input.getPrimaryAudioTrack(),input.computeDuration()]);
    if(actualWidth!==width||actualHeight!==height)throw Error('O corte saiu em '+actualWidth+' × '+actualHeight+' e deveria manter '+width+' × '+height+'. Ele não foi salvo para evitar reduzir a resolução.');
    if(needsAudio&&!audio)throw Error('A faixa de áudio não foi preservada. O corte não foi salvo sem som.');
    if(Math.abs(duration-length)>.15)throw Error('A duração do arquivo gerado não corresponde à seleção. Tente novamente.');
    const actual=[];for await(const packet of new EncodedPacketSink(video).packets())actual.push({time:packet.timestamp,duration:packet.duration});
    assertOfflineTimeline(frames,actual);
    return {width:actualWidth,height:actualHeight,frames:actual.length,duration};
  }finally{input.dispose();}
}
export async function renderOfflineClip(source,file,segment,options,status,signal,{ConversionClass=Conversion,OutputClass=Output,TargetClass=BufferTarget,FormatClass=Mp4OutputFormat,verify=inspectOfflineOutput}={}){
  aborted(signal);
  const profile=originalEncodingProfile(source.width,source.height,file.size,source.duration);
  const frames=[],target=new TargetClass(),output=new OutputClass({format:new FormatClass({fastStart:'reserve'}),target});
  let conversion=null,lastProgress=0;
  const cancel=()=>{if(conversion)void conversion.cancel().catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    conversion=await ConversionClass.init({input:source.input,output,tracks:'primary',trim:{start:segment.start,end:segment.start+segment.length},video:{width:source.width,height:source.height,fit:'contain',allowTransformationMetadata:false,codec:'avc',quality:new Quality({bitrate:profile.videoBitsPerSecond,bitrateMode:'variable'}),hardwareAcceleration:'no-preference',forceTranscode:true,keyFrameInterval:2,processedWidth:source.width,processedHeight:source.height,process:createOfflineProcessor({width:source.width,height:source.height,watermark:options.watermark,brand:options.brand,start:segment.start,frames})},audio:{codec:'aac'},showWarnings:false});
    aborted(signal);
    const lost=conversion.discardedTracks.filter(item=>item.track.type==='video'||item.track.type==='audio');
    if(!conversion.isValid||lost.length)throw Error('Este navegador não conseguiu preparar o vídeo e o áudio para o corte offline. Use Chrome ou Edge atualizado no PC. Se persistir, envie o arquivo original para verificar o codec; nenhum vídeo será reduzido ou salvo sem áudio.');
    conversion.onProgress=progress=>{if(Date.now()-lastProgress>250){status(Math.floor(progress*100)+'% · '+source.width+' × '+source.height+' · processando quadros do arquivo. Não feche a página; pode levar mais tempo que a duração do trecho.');lastProgress=Date.now();}};
    await conversion.execute();aborted(signal);
    if(!target.buffer?.byteLength)throw Error('O processamento não produziu um arquivo. Tente novamente.');
    const blob=new Blob([target.buffer],{type:'video/mp4'});
    status('Conferindo resolução, áudio e sequência dos '+frames.length+' quadros...');
    const verification=await verify(blob,{width:source.width,height:source.height,frames,needsAudio:!!source.audio,length:segment.length});
    return {blob,verification};
  }catch(error){if(conversion&&conversion.state!=='done'&&conversion.state!=='canceled')try{await conversion.cancel();}catch{}if(signal?.aborted||error?.name==='ConversionCanceledError')throw new DOMException('Corte cancelado.','AbortError');throw error;}
  finally{signal?.removeEventListener('abort',cancel);}
}
