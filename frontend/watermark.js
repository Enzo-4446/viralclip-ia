// Time-based motion is shared by preview and exported video.
export function watermarkPosition(width,height,textWidth,size,time=0) {
  const margin=Math.max(8,Math.min(width,height)*.045);
  const xMin=margin+textWidth,xMax=Math.max(xMin,width-margin);
  const yMin=margin+size,yMax=Math.max(yMin,height-margin);
  const t=Number.isFinite(time)?time:0;
  return {
    x:xMin+(xMax-xMin)*(.5+.5*Math.sin(t*2*Math.PI/17+.6)),
    y:yMin+(yMax-yMin)*(.5+.5*Math.sin(t*2*Math.PI/13+1.8))
  };
}
const stamps=new Map();
if(globalThis.document?.fonts?.addEventListener)document.fonts.addEventListener('loadingdone',()=>stamps.clear());
function paintText(ctx,label,x,y,size,maxWidth){
  ctx.font='650 '+size+'px "Manrope Variable", "Segoe UI", sans-serif';ctx.letterSpacing=(size*.07)+'px';
  ctx.textAlign='right';ctx.textBaseline='bottom';
  const gold=ctx.createLinearGradient(0,y-size,0,y);
  gold.addColorStop(0,'#fff0b0');gold.addColorStop(.45,'#e3c16a');gold.addColorStop(1,'#ad7e2b');
  ctx.fillStyle=gold;ctx.globalAlpha=.88;ctx.shadowColor='rgba(0,0,0,.48)';ctx.shadowBlur=Math.max(1,size*.12);ctx.shadowOffsetY=1;ctx.fillText(label,x,y,maxWidth);
}
export function drawWatermark(ctx,width,height,text,time=0){
  if(!text?.trim())return;
  const label=text.trim().slice(0,32),size=Math.max(9,Math.round(Math.min(width,height)*.027)),maxWidth=width*.38;
  const key=width+'|'+height+'|'+label;
  if(globalThis.document?.createElement&&typeof ctx.drawImage==='function'){
    let stamp=stamps.get(key);
    if(!stamp){
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
      context.font='650 '+size+'px "Manrope Variable", "Segoe UI", sans-serif';context.letterSpacing=(size*.07)+'px';
      const textWidth=Math.min(context.measureText(label).width,maxWidth),padding=Math.ceil(size*.3+3);
      canvas.width=Math.ceil(textWidth+padding*2);canvas.height=Math.ceil(size+padding*2);
      paintText(context,label,textWidth+padding,size+padding,size,maxWidth);
      stamp={canvas,textWidth,padding};if(stamps.size>=8)stamps.clear();stamps.set(key,stamp);
    }
    const {x,y}=watermarkPosition(width,height,stamp.textWidth,size,time);
    ctx.drawImage(stamp.canvas,x-stamp.textWidth-stamp.padding,y-size-stamp.padding);return;
  }
  // Also usable without a DOM by the drawing verification tests.
  ctx.save();ctx.font='650 '+size+'px "Manrope Variable", "Segoe UI", sans-serif';ctx.letterSpacing=(size*.07)+'px';
  const {x,y}=watermarkPosition(width,height,Math.min(ctx.measureText(label).width,maxWidth),size,time);
  paintText(ctx,label,x,y,size,maxWidth);ctx.restore();
}
