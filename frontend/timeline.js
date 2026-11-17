import {drawWatermark} from './watermark.js';
export function mountTimeline({preview,root,mode,duration,start,end,watermark,brand,engine,generate}) {
  const $=id=>root.querySelector('#'+id);
  let video=null,total=0,selected=10,queue=[],busy=false,playing=false;
  const overlay=document.createElement('canvas');overlay.className='watermark-overlay';
  const local=()=>engine.value==='local';
  const length=()=>Number(duration.value);
  const last=()=>Math.min(total-10,end.value===''?total-10:Number(end.value));
  const max=()=>last()-length();
  const fmt=t=>{const n=Math.max(0,t);return Math.floor(n/60)+':'+(n%60).toFixed(1).padStart(4,'0');};
  function paintMark(){
    if(!video||!video.videoWidth)return;
    const box=preview.getBoundingClientRect(),scale=Math.min(box.width/video.videoWidth,box.height/video.videoHeight);
    overlay.width=Math.round(video.videoWidth*scale);overlay.height=Math.round(video.videoHeight*scale);
    overlay.style.width=overlay.width+'px';overlay.style.height=overlay.height+'px';
    overlay.hidden=!watermark.checked||!local();
    drawWatermark(overlay.getContext('2d'),overlay.width,overlay.height,brand.value);
  }
  function render(){
    root.hidden=!local()||mode.value!=='single'||!video;
    $('timelineDuration').value=duration.value;
    const valid=Number.isFinite(total)&&max()>=10;
    selected=valid?Math.max(10,Math.min(selected,max())):10;
    const slider=$('selectionStart');slider.min=10;slider.max=Math.max(10,max());slider.value=selected;slider.disabled=!valid||busy;
    $('selectionWindow').style.left=(total?selected/total*100:0)+'%';
    $('selectionWindow').style.width=(total?length()/total*100:0)+'%';
    $('excludedIntro').style.width=(total?Math.min(50,10/total*100):0)+'%';
    $('excludedOutro').style.width=(total?Math.min(50,10/total*100):0)+'%';
    $('selectionWindow').textContent=length()+'s';
    $('selectionWindow').hidden=!valid;
    $('intervalLabel').textContent=valid?fmt(selected)+' → '+fmt(selected+length())+' · '+length()+' segundos':total?'O intervalo útil de '+Math.max(0,total-20).toFixed(1)+'s não comporta '+length()+'s. Escolha uma duração menor.':'Carregue um vídeo.';
    $('timelineEnd').textContent=fmt(total);
    for(const id of ['previewSelection','addSelection','cutSelection'])$(id).disabled=!valid||busy;
    $('timelineDuration').disabled=busy;
    $('addSelection').disabled=!valid||busy||queue.length>=10;
    $('cutSelection').textContent=queue.length?'Cortar '+queue.length+' trechos de '+length()+'s':'Cortar trecho de '+length()+'s';
    $('selectionQueue').replaceChildren();
    queue.forEach((item,index)=>{const row=document.createElement('div');row.className='queued-cut';const text=document.createElement('span');text.textContent=(index+1)+'. '+fmt(item.start)+' → '+fmt(item.start+length());const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.disabled=busy;remove.onclick=()=>{queue.splice(index,1);render();};row.append(text,remove);$('selectionQueue').append(row);});
    if(valid)start.value=selected.toFixed(2);
    paintMark();
  }
  function choose(value,seek=true){if(busy||!video)return;selected=Number(value);render();if(seek&&max()>=10){playing=false;video.pause();video.currentTime=selected;}}
  function bindVideo(){
    const next=preview.querySelector('video');if(next===video)return;
    video?.pause();video=next;queue=[];playing=false;total=0;selected=10;
    if(video){const ready=()=>{total=video.duration;selected=10;render();if(max()>=10)video.currentTime=selected;};video.addEventListener('loadedmetadata',ready);video.addEventListener('timeupdate',()=>{if(playing&&video.currentTime>=selected+length()){video.pause();playing=false;}});if(video.readyState>=1)ready();preview.append(overlay);}else overlay.remove();render();
  }
  $('selectionStart').oninput=e=>choose(e.target.value);
  let dragging=false,anchor=0;
  const track=$('selectionTrack');
  track.onpointerdown=e=>{if(busy||max()<10)return;const rect=track.getBoundingClientRect(),time=(e.clientX-rect.left)/rect.width*total;anchor=time>=selected&&time<=selected+length()?time-selected:length()/2;dragging=true;track.setPointerCapture(e.pointerId);choose(time-anchor);};
  track.onpointermove=e=>{if(!dragging)return;const rect=track.getBoundingClientRect();choose((e.clientX-rect.left)/rect.width*total-anchor);};
  track.onpointerup=track.onpointercancel=()=>{dragging=false;};
  $('timelineDuration').onchange=e=>{duration.value=e.target.value;duration.dispatchEvent(new Event('change'));};
  duration.addEventListener('change',()=>{queue=[];render();});
  start.addEventListener('input',()=>choose(start.value));end.addEventListener('input',()=>{queue=[];render();});
  $('previewSelection').onclick=async()=>{if(!video||busy)return;video.currentTime=selected;playing=true;try{await video.play();}catch{playing=false;}};
  $('addSelection').onclick=()=>{if(queue.some(x=>Math.abs(x.start-selected)<.05))return;queue.push({start:selected});render();};
  $('cutSelection').onclick=()=>{video?.pause();generate.click();};
  mode.addEventListener('change',render);engine.addEventListener('change',render);watermark.addEventListener('change',paintMark);brand.addEventListener('input',paintMark);
  new MutationObserver(bindVideo).observe(preview,{childList:true});new ResizeObserver(paintMark).observe(preview);
  bindVideo();
  return {getSelections:()=>queue.length?queue.map(x=>({...x})):[{start:selected}],setBusy(value){busy=value;if(value){playing=false;video?.pause();}render();},refresh:render};
}
