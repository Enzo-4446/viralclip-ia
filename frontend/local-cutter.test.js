import test from 'node:test';
import assert from 'node:assert/strict';
import {planSegments,recordingFormat} from './local-cutter.js';
import {drawWatermark,watermarkPosition} from './watermark.js';
test('batch excludes both ten-second margins and preserves duration',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:3,clipDuration:45}),[{start:10,length:45},{start:55,length:45},{start:100,length:45}]));
test('short range rejects count instead of shortening clips',()=>assert.throws(()=>planSegments(100,{mode:'batch',count:3,clipDuration:30}),/comporta 2/));
test('exact fit excludes outro',()=>assert.deepEqual(planSegments(110,{mode:'batch',count:3,clipDuration:30}),[{start:10,length:30},{start:40,length:30},{start:70,length:30}]));
test('manual queue uses selected starts and fixed duration',()=>assert.deepEqual(planSegments(167,{mode:'single',duration:45,selections:[{start:20},{start:90}]}),[{start:20,length:45},{start:90,length:45}]));
test('manual rejects clips crossing either protected margin',()=>{for(const start of [0,9,128])assert.throws(()=>planSegments(167,{mode:'single',duration:30,selections:[{start}]}));});
test('manual preserves 30,45,60 second presets',()=>{for(const duration of [30,45,60])assert.deepEqual(planSegments(167,{mode:'single',start:15,duration}),[{start:15,length:duration}]);});
test('custom interval remains inside safe region',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:2,clipDuration:30,start:25,end:85}),[{start:25,length:30},{start:55,length:30}]));
test('invalid duration, count, range and short sources are rejected',()=>{for(const opts of [{mode:'single',start:167,duration:2},{mode:'batch',count:0,clipDuration:30},{mode:'batch',count:99,clipDuration:30},{mode:'batch',count:2,clipDuration:NaN},{mode:'single',start:10,end:9,duration:30}])assert.throws(()=>planSegments(167,opts));assert.throws(()=>planSegments(20,{mode:'single',duration:30}));});
test('extension matches supported encoder',()=>{assert.equal(recordingFormat({isTypeSupported:t=>t==='video/webm'}).extension,'webm');assert.equal(recordingFormat({isTypeSupported:t=>t==='video/mp4'}).extension,'mp4');assert.throws(()=>recordingFormat({isTypeSupported:()=>false}));});
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
