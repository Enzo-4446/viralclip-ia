import {drawWatermark} from './watermark.js';
export function timelineBounds(total,seconds,skipStart,skipEnd,end='') {
  const min=Number(skipStart),tail=Number(skipEnd),length=Number(seconds);
  const last=Math.min(total-tail,end===''?total-tail:Number(end));
  const max=last-length;
  return {min,last,max,useful:Math.max(0,last-min),valid:Number.isFinite(total)&&total>0&&Number.isFinite(min)&&min>=0&&Number.isFinite(tail)&&tail>=0&&Number.isFinite(length)&&length>0&&Number.isFinite(last)&&max>=min-1e-6};
}
export function mountTimeline({preview,root,mode,duration,start,end,watermark,brand,engine,generate,trimStart,trimEnd}) {
  const $=id=>root.querySelector('#'+id);
  let video=null,total=0,selected=10,queue=[],busy=false,playing=false,animationFrame=null;
  const overlay=document.createElement('canvas');overlay.className='watermark-overlay';
  const local=()=>engine.value==='local';
  const length=()=>Number(duration.value);
  const bounds=()=>timelineBounds(total,length(),trimStart.value,trimEnd.value,end.value);
  const first=()=>bounds().min;
  const max=()=>bounds().max;
  const fmt=t=>{const n=Math.max(0,t);return Math.floor(n/60)+':'+(n%60).toFixed(1).padStart(4,'0');};
  function paintMark(){
    if(!video||!video.videoWidth)return;
    const box=preview.getBoundingClientRect(),scale=Math.min(box.width/video.videoWidth,box.height/video.videoHeight);
    overlay.width=Math.round(video.videoWidth*scale);overlay.height=Math.round(video.videoHeight*scale);
    overlay.style.width=overlay.width+'px';overlay.style.height=overlay.height+'px';
    overlay.hidden=!watermark.checked||!local();
    drawWatermark(overlay.getContext('2d'),overlay.width,overlay.height,brand.value,video.currentTime);
  }
  function animateMark(){
    cancelAnimationFrame(animationFrame);paintMark();
    if(video&&!video.paused&&!video.ended)animationFrame=requestAnimationFrame(animateMark);
  }
  function render(){
    root.hidden=!local()||mode.value!=='single'||!video;
    $('timelineDuration').value=duration.value;
    const limits=bounds(),valid=limits.valid;
    selected=valid?Math.max(first(),Math.min(selected,max())):Math.max(0,first()||0);
    const slider=$('selectionStart');slider.min=Math.max(0,first()||0);slider.max=Math.max(Number(slider.min),Number.isFinite(max())?max():0);slider.value=selected;slider.disabled=!valid||busy;
    $('selectionWindow').style.left=(total?selected/total*100:0)+'%';
    $('selectionWindow').style.width=(total?length()/total*100:0)+'%';
    $('excludedIntro').style.width=(total?Math.min(100,Math.max(0,Number(trimStart.value)||0)/total*100):0)+'%';
    $('excludedOutro').style.width=(total?Math.min(100,Math.max(0,Number(trimEnd.value)||0)/total*100):0)+'%';
    $('selectionWindow').textContent=length()+'s';
    $('selectionWindow').hidden=!valid;
    $('intervalLabel').textContent=valid?fmt(selected)+' → '+fmt(selected+length())+' · '+length()+' segundos':!total?'Carregue um vídeo.':!Number.isFinite(first())||first()<0||!Number.isFinite(Number(trimEnd.value))||Number(trimEnd.value)<0?'Em “Ignorar no início” e “Ignorar no final”, digite segundos iguais ou maiores que 0.':end.value!==''&&(!Number.isFinite(Number(end.value))||Number(end.value)<=first())?'O campo “Terminar em” está em '+end.value+'s e bloqueia a seleção. Apague esse valor para usar o final automático ou clique em “Limpar limite de final” abaixo.':'O intervalo escolhido tem '+limits.useful.toFixed(1)+'s úteis e não comporta '+length()+'s. Reduza os segundos ignorados ou escolha uma duração menor. Se você preencheu “Terminar em”, apague o valor ou use “Limpar limite de final”.';
    $('resetManualRange').hidden=valid||!total||end.value==='';
    $('resetManualRange').disabled=busy;
    $('timelineEnd').textContent=fmt(total);
    for(const id of ['previewSelection','addSelection','cutSelection'])$(id).disabled=!valid||busy;
    $('timelineDuration').disabled=busy;
    $('addSelection').disabled=!valid||busy||queue.length>=10;
    $('cutSelection').textContent=queue.length?'Cortar '+queue.length+' trechos de '+length()+'s':'Cortar trecho de '+length()+'s';
    $('selectionQueue').replaceChildren();
    queue.forEach((item,index)=>{const row=document.createElement('div');row.className='queued-cut';const text=document.createElement('span');text.textContent=(index+1)+'. '+fmt(item.start)+' → '+fmt(item.start+length());const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.disabled=busy;remove.onclick=()=>{queue.splice(index,1);render();};row.append(text,remove);$('selectionQueue').append(row);});
    if(valid&&mode.value==='single'&&document.activeElement!==start)start.value=selected.toFixed(2);
    paintMark();
  }
  function choose(value,seek=true){if(busy||!video)return;selected=Number(value);render();if(seek&&bounds().valid){playing=false;video.pause();video.currentTime=selected;}}
  function bindVideo(){
    const next=preview.querySelector('video');if(next===video)return;
    cancelAnimationFrame(animationFrame);video?.pause();video=next;queue=[];playing=false;total=0;selected=10;
    if(video){const ready=()=>{total=video.duration;end.value='';start.value='';selected=Math.max(0,Number(trimStart.value)||0);render();if(bounds().valid)video.currentTime=selected;video.dispatchEvent(new Event('cliprangechange'));};video.addEventListener('loadedmetadata',ready);video.addEventListener('play',animateMark);video.addEventListener('pause',paintMark);video.addEventListener('seeked',paintMark);video.addEventListener('timeupdate',()=>{if(playing&&video.currentTime>=selected+length()){video.pause();playing=false;}});if(video.readyState>=1)ready();preview.append(overlay);}else overlay.remove();render();
  }
  $('selectionStart').oninput=e=>choose(e.target.value);
  let dragging=false,anchor=0;
  const track=$('selectionTrack');
  track.onpointerdown=e=>{if(busy||!bounds().valid)return;const rect=track.getBoundingClientRect(),time=(e.clientX-rect.left)/rect.width*total;anchor=time>=selected&&time<=selected+length()?time-selected:length()/2;dragging=true;track.setPointerCapture(e.pointerId);choose(time-anchor);};
  track.onpointermove=e=>{if(!dragging)return;const rect=track.getBoundingClientRect();choose((e.clientX-rect.left)/rect.width*total-anchor);};
  track.onpointerup=track.onpointercancel=()=>{dragging=false;};
  $('timelineDuration').onchange=e=>{duration.value=e.target.value;duration.dispatchEvent(new Event('change'));};
  duration.addEventListener('change',()=>{queue=[];render();});
  start.addEventListener('change',()=>{if(mode.value==='single')choose(start.value);});end.addEventListener('input',()=>{queue=[];render();});
  for(const input of [trimStart,trimEnd])input.addEventListener('input',()=>{queue=[];if(mode.value==='batch')start.value='';render();});
  $('resetManualRange').onclick=()=>{end.value='';queue=[];selected=Math.max(0,Number(trimStart.value)||0);start.value='';render();end.dispatchEvent(new Event('input'));if(bounds().valid)video.currentTime=selected;};
  $('previewSelection').onclick=async()=>{if(!video||busy)return;video.currentTime=selected;playing=true;try{await video.play();}catch{playing=false;}};
  $('addSelection').onclick=()=>{if(queue.some(x=>Math.abs(x.start-selected)<.05))return;queue.push({start:selected});render();};
  $('cutSelection').onclick=()=>{video?.pause();generate.click();};
  mode.addEventListener('change',render);engine.addEventListener('change',render);watermark.addEventListener('change',paintMark);brand.addEventListener('input',paintMark);
  new MutationObserver(bindVideo).observe(preview,{childList:true});new ResizeObserver(paintMark).observe(preview);
  bindVideo();document.fonts.ready.then(paintMark);
  return {getSelections:()=>queue.length?queue.map(x=>({...x})):[{start:selected}],setBusy(value){busy=value;if(value){playing=false;video?.pause();}render();},refresh:render};
}


