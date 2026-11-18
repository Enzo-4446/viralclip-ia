import test from 'node:test';
import assert from 'node:assert/strict';
import {planSegments} from './local-cutter.js';
import {drawWatermark,watermarkPosition} from './watermark.js';
test('batch excludes both ten-second margins and preserves duration',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:3,clipDuration:45}),[{start:10,length:45},{start:55,length:45},{start:100,length:45}]));
test('short range rejects count instead of shortening clips',()=>assert.throws(()=>planSegments(100,{mode:'batch',count:3,clipDuration:30}),/comporta 2/));
test('exact fit excludes outro',()=>assert.deepEqual(planSegments(110,{mode:'batch',count:3,clipDuration:30}),[{start:10,length:30},{start:40,length:30},{start:70,length:30}]));
test('manual queue uses selected starts and fixed duration',()=>assert.deepEqual(planSegments(167,{mode:'single',duration:45,selections:[{start:20},{start:90}]}),[{start:20,length:45},{start:90,length:45}]));
test('manual rejects clips crossing either protected margin',()=>{for(const start of [0,9,128])assert.throws(()=>planSegments(167,{mode:'single',duration:30,selections:[{start}]}));});
test('manual preserves 30,45,60 second presets',()=>{for(const duration of [30,45,60])assert.deepEqual(planSegments(167,{mode:'single',start:15,duration}),[{start:15,length:duration}]);});
test('custom interval remains inside safe region',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:2,clipDuration:30,start:25,end:85}),[{start:25,length:30},{start:55,length:30}]));
test('invalid duration, count, range and short sources are rejected',()=>{for(const opts of [{mode:'single',start:167,duration:2},{mode:'batch',count:0,clipDuration:30},{mode:'batch',count:99,clipDuration:30},{mode:'batch',count:2,clipDuration:NaN},{mode:'single',start:10,end:9,duration:30}])assert.throws(()=>planSegments(167,opts));assert.throws(()=>planSegments(20,{mode:'single',duration:30}));});
test('watermark draws safe, bounded gold text and restores canvas state',()=>{const calls=[];const ctx={measureText:()=>({width:160}),save:()=>calls.push('save'),restore:()=>calls.push('restore'),createLinearGradient:()=>({addColorStop:(...x)=>calls.push(x)}),fillText:(...x)=>calls.push(x)};drawWatermark(ctx,1920,1080,'MY BRAND');assert.equal(calls[0],'save');assert.ok(calls.some(x=>Array.isArray(x)&&x[0]==='MY BRAND'&&x[1]<1920&&x[2]<1080));assert.equal(calls.at(-1),'restore');});

test('moving watermark stays inside frame in portrait, square and landscape',()=>{
  for(const [w,h] of [[360,640],[1080,1920],[1920,1080],[720,720]]) {
    const size=Math.round(Math.min(w,h)*.027),tw=w*.38;
    for(let t=0;t<300;t+=.25) {
      const p=watermarkPosition(w,h,tw,size,t);
      assert.ok(p.x-tw>=7.99&&p.x<=w-7.99);
      assert.ok(p.y-size>=7.99&&p.y<=h-7.99);
    }
    assert.notDeepEqual(watermarkPosition(w,h,tw,size,0),watermarkPosition(w,h,tw,size,5));
  }
});


test('invalid interval identifies entered values and exact repair steps',()=>{
  assert.throws(()=>planSegments(167.7,{mode:'batch',count:3,clipDuration:45,start:160,end:0}),error=>error.resetRange===true&&error.message.includes('“Começar em” = 160')&&error.message.includes('“Terminar em” = 0')&&error.message.includes('digite 10')&&error.message.includes('deixe vazio')&&error.message.includes('157.7'));
});
test('insufficient footage gives achievable count and duration choices',()=>{
  assert.throws(()=>planSegments(167.7,{mode:'batch',count:3,clipDuration:60}),error=>error.message.includes('necessários 180s')&&error.message.includes('escolha 2 ou menos')&&error.message.includes('escolha 30 ou 45 segundos'));
});


import {timelineBounds} from './timeline.js';
test('zero ignored seconds allows cutting from the beginning to the real end',()=>assert.deepEqual(planSegments(90,{mode:'batch',count:3,clipDuration:30,trimStart:0,trimEnd:0}),[{start:0,length:30},{start:30,length:30},{start:60,length:30}]));
test('custom ignored seconds are applied independently',()=>assert.deepEqual(planSegments(90,{mode:'single',duration:30,trimStart:5,trimEnd:3,selections:[{start:57}]}),[{start:57,length:30}]));
test('negative or excessive ignored seconds are rejected clearly',()=>{for(const margins of [{trimStart:-1,trimEnd:0},{trimStart:0,trimEnd:-1},{trimStart:60,trimEnd:30}])assert.throws(()=>planSegments(90,{mode:'single',duration:30,...margins}));});
test('90 second video with 70 useful seconds enables 30 second selection',()=>{assert.equal(timelineBounds(90,30,10,10).valid,true);assert.equal(timelineBounds(90,30,10,10).max,50);});
test('an additional end constraint explains the real available interval',()=>{const range=timelineBounds(90,30,10,10,'0');assert.equal(range.valid,false);assert.equal(range.useful,0);});
test('timeline supports zero margins and custom margins consistently with exporter',()=>{assert.deepEqual(timelineBounds(90,30,0,0),{min:0,last:90,max:60,useful:90,valid:true});assert.deepEqual(timelineBounds(90,30,5,3),{min:5,last:87,max:57,useful:82,valid:true});});


import {renderVideoFrames,originalEncodingProfile} from './video-frames.js';
test('Full HD and 4K source dimensions are never downscaled by export profile',()=>{for(const [width,height] of [[1920,1080],[1080,1920],[3840,2160]]){const profile=originalEncodingProfile(width,height,50000000,60);assert.equal(profile.width,width);assert.equal(profile.height,height);assert.ok(profile.videoBitsPerSecond>=width*height*6);}});
test('capture follows new decoded frames and skips repeated source images',()=>{let callback,id=0,canceled=0;const frames=[];const video={paused:false,currentTime:0,requestVideoFrameCallback:fn=>{callback=fn;return ++id;},cancelVideoFrameCallback:()=>canceled++};const stop=renderVideoFrames(video,time=>frames.push(time));for(const time of [0,0,1/60,2/60,2/60,3/60])callback(0,{mediaTime:time});stop();assert.deepEqual(frames,[0,1/60,2/60,3/60]);assert.equal(canceled,1);});
test('fallback renderer does not duplicate the same media time on screen refresh',()=>{let callback;const frames=[];const video={paused:false,currentTime:1};const stop=renderVideoFrames(video,time=>frames.push(time),{raf:fn=>{callback=fn;return 1;},caf:()=>{}});callback();callback();video.currentTime=1.04;callback();stop();assert.deepEqual(frames,[1,1.04]);});
test('90, 105 and 120 second manual durations are preserved',()=>{for(const duration of [90,105,120])assert.deepEqual(planSegments(180,{mode:'single',start:10,duration}),[{start:10,length:duration}]);});


import {assertOfflineTimeline,createOfflineProcessor,renderOfflineClip} from './offline-cutter.js';
test('offline verification detects missing and retimed frames, allowing encoder packet reordering',()=>{
  const frames=[{time:0},{time:1/60},{time:2/60}];
  assert.doesNotThrow(()=>assertOfflineTimeline(frames,[frames[2],frames[0],frames[1]]));
  assert.throws(()=>assertOfflineTimeline(frames,frames.slice(1)),/todos os quadros/);
  assert.throws(()=>assertOfflineTimeline(frames,[frames[0],frames[1],{time:.73}]),/tempo de um quadro/);
});
test('offline processing preserves original dimensions and media timestamps regardless of wall clock',()=>{
  const frames=[],process=createOfflineProcessor({width:1920,height:1080,watermark:false,frames});
  for(const timestamp of [0,1/60,2/60]){
    const sample={displayWidth:1920,displayHeight:1080,timestamp,duration:1/60};
    assert.equal(process(sample),sample);
  }
  assert.deepEqual(frames.map(x=>x.time),[0,1/60,2/60]);
  assert.throws(()=>process({displayWidth:1280,displayHeight:720}),/resolução/);
});
test('offline watermark is painted on every original-sized decoded frame',()=>{
  const frames=[],draws=[],canvas={width:1920,height:1080};
  const ctx={canvas,save(){},restore(){},measureText:()=>({width:180}),createLinearGradient:()=>({addColorStop(){}}),fillText:(...args)=>draws.push(args)};
  canvas.getContext=()=>ctx;
  const process=createOfflineProcessor({width:1920,height:1080,watermark:true,brand:'@GTA.VI.RAL',frames,createCanvas:()=>canvas});
  for(const timestamp of [0,1])assert.equal(process({displayWidth:1920,displayHeight:1080,timestamp,duration:1/60,draw:(context,x,y,w,h)=>assert.deepEqual([context,x,y,w,h],[ctx,0,0,1920,1080])}),canvas);
  assert.equal(draws.length,2);assert.equal(draws[0][0],'@GTA.VI.RAL');assert.notDeepEqual(draws[0],draws[1]);
});
test('offline export refuses silently discarded audio and releases conversion',async()=>{
  let canceled=false;
  class Target{};class Format{};class Output{constructor(options){this.options=options;}}
  const Conversion={init:async()=>({isValid:true,state:'pending',discardedTracks:[{track:{type:'audio'}}],cancel:async()=>{canceled=true;}})};
  await assert.rejects(renderOfflineClip({width:1920,height:1080,duration:10,input:{}},{size:1000},{start:0,length:2},{},()=>{},undefined,{ConversionClass:Conversion,OutputClass:Output,TargetClass:Target,FormatClass:Format}),/áudio/);
  assert.equal(canceled,true);
});

import {updateUrl} from './app-version.js';
test('version refresh keeps the site path and replaces a stale cache key',()=>{
  assert.equal(updateUrl('https://enzo-4446.github.io/viralclip-ia/?v=old&other=1','new'), 'https://enzo-4446.github.io/viralclip-ia/?v=new&other=1');
});
