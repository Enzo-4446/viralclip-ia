// Shared by local export and preview QA. A subtle gold signature inside safe margins.
export function drawWatermark(ctx,width,height,text) {
  if(!text?.trim())return;
  ctx.save();
  const size=Math.max(9,Math.round(Math.min(width,height)*.027));
  const margin=Math.max(12,Math.min(width,height)*.045);
  ctx.font='600 '+size+'px Georgia, serif';
  ctx.textAlign='right';ctx.textBaseline='bottom';
  const gold=ctx.createLinearGradient(0,height-margin-size,0,height-margin);
  gold.addColorStop(0,'#fff0b0');gold.addColorStop(.45,'#e3c16a');gold.addColorStop(1,'#ad7e2b');
  ctx.fillStyle=gold;ctx.globalAlpha=.88;
  ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=Math.max(2,size*.18);ctx.shadowOffsetY=1;
  ctx.fillText(text.trim().slice(0,32),width-margin,height-margin,width*.38);
  ctx.restore();
}
