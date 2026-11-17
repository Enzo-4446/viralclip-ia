import test from 'node:test';
import assert from 'node:assert/strict';
import {planSegments,recordingFormat} from './local-cutter.js';
test('3 clips of 45 seconds when source is long enough',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:3,clipDuration:45}),[{start:0,length:45},{start:45,length:45},{start:90,length:45}]));
test('short source still produces exactly 3 distinct clips',()=>assert.deepEqual(planSegments(80,{mode:'batch',count:3,clipDuration:45}),[{start:0,length:80/3},{start:80/3,length:80/3},{start:160/3,length:80-160/3}]));
test('requested count and complete coverage for short sources',()=>{for(const total of [45,60,89.99,90,91,134,135,167]){const parts=planSegments(total,{mode:'batch',count:3,clipDuration:45});assert.equal(parts.length,3);assert.equal(parts[0].start,0);for(let i=1;i<parts.length;i++)assert.ok(Math.abs(parts[i].start-parts[i-1].start-parts[i-1].length)<1e-9);assert.ok(parts.at(-1).start+parts.at(-1).length<=total+1e-9);}});
test('very short sources report impossibility rather than returning fewer clips',()=>assert.throws(()=>planSegments(1,{mode:'batch',count:3,clipDuration:45})));
test('manual ending is clamped to source',()=>assert.deepEqual(planSegments(167,{mode:'single',start:160,duration:60}),[{start:160,length:7}]));
test('invalid range and count are rejected',()=>{for(const options of [{mode:'single',start:167,duration:2},{mode:'single',start:-1,duration:2},{mode:'batch',count:0,clipDuration:30},{mode:'batch',count:99,clipDuration:30},{mode:'batch',count:2,clipDuration:NaN}])assert.throws(()=>planSegments(167,options));});
test('extension matches native encoder format',()=>{assert.equal(recordingFormat({isTypeSupported:t=>t==='video/webm'}).extension,'webm');assert.equal(recordingFormat({isTypeSupported:t=>t==='video/mp4'}).extension,'mp4');assert.throws(()=>recordingFormat({isTypeSupported:()=>false}));});

test('skip a five-second introduction in batch mode',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:3,clipDuration:45,start:5}),[{start:5,length:45},{start:50,length:45},{start:95,length:45}]));
test('restrict all clips to the selected start and end',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:3,clipDuration:45,start:5,end:95}),[{start:5,length:30},{start:35,length:30},{start:65,length:30}]));
test('manual clip respects end as well as duration',()=>assert.deepEqual(planSegments(167,{mode:'single',start:5,end:15,duration:45}),[{start:5,length:10}]));
test('invalid end boundaries are rejected',()=>{for(const end of [5,4,168,NaN])assert.throws(()=>planSegments(167,{mode:'batch',count:3,clipDuration:45,start:5,end}));});
