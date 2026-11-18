// Decode-driven rendering: never record display refreshes as new video frames.
export function renderVideoFrames(video,onFrame,{fps=Infinity,raf=globalThis.requestAnimationFrame,caf=globalThis.cancelAnimationFrame}={}) {
  let stopped=false,handle=null,last=-Infinity;
  const native=typeof video.requestVideoFrameCallback==='function';
  const minimum=Number.isFinite(fps)?1/fps:0;
  const tick=(now,metadata)=>{
    if(stopped)return;
    const time=metadata?.mediaTime??video.currentTime;
    if(!video.paused&&Number.isFinite(time)&&time>last+.00001&&time-last>=minimum-.002){last=time;onFrame(time,metadata);}
    if(!stopped)handle=native?video.requestVideoFrameCallback(tick):raf(tick);
  };
  handle=native?video.requestVideoFrameCallback(tick):raf(tick);
  return ()=>{stopped=true;if(handle!=null){if(native)video.cancelVideoFrameCallback?.(handle);else caf(handle);}};
}
export function originalEncodingProfile(width,height,fileBytes,duration) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)throw Error('Não foi possível ler a resolução original. Selecione o vídeo novamente.');
  const sourceRate=Number.isFinite(duration)&&duration>0?fileBytes*8/duration:0;
  // High-quality AVC budget; keep the source pixel dimensions without automatic downscaling.
  return {width,height,videoBitsPerSecond:Math.round(Math.max(width*height*6,sourceRate*1.15,2000000)),audioBitsPerSecond:256000};
}
export function captureHealth(start,length){
  let last=start,frames=0,gap=0;
  return {frame(time){if(time>=last){gap=Math.max(gap,time-last);last=time;frames++;}},check(){const worst=Math.max(gap,start+length-last);if(frames<Math.max(2,length*5)||worst>.4)throw Error('O dispositivo perdeu quadros durante a gravação (maior intervalo: '+worst.toFixed(2)+'s). Este corte não foi salvo para evitar entregar um vídeo congelado. Feche outras reproduções e programas pesados e tente 1 corte. A resolução original não será reduzida automaticamente.');return {frames,maxGap:worst};}};
}
