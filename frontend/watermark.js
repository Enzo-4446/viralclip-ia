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
export function drawWatermark(ctx,width,height,text,time=0) {
  if(!text?.trim())return;
  ctx.save();
  const label=text.trim().slice(0,32);
  const size=Math.max(9,Math.round(Math.min(width,height)*.027));
  ctx.font='650 '+size+'px "Manrope Variable", "Segoe UI", sans-serif';
  ctx.letterSpacing=(size*.07)+'px';
  const maxWidth=width*.38;
  const textWidth=Math.min(ctx.measureText(label).width,maxWidth);
  const {x,y}=watermarkPosition(width,height,textWidth,size,time);
  ctx.textAlign='right';ctx.textBaseline='bottom';
  const gold=ctx.createLinearGradient(0,y-size,0,y);
  gold.addColorStop(0,'#fff0b0');gold.addColorStop(.45,'#e3c16a');gold.addColorStop(1,'#ad7e2b');
  ctx.fillStyle=gold;ctx.globalAlpha=.88;
  ctx.shadowColor='rgba(0,0,0,.48)';ctx.shadowBlur=Math.max(1,size*.12);ctx.shadowOffsetY=1;
  ctx.fillText(label,x,y,maxWidth);
  ctx.restore();
}

