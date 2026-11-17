import test from 'node:test';
import assert from 'node:assert/strict';
import {planSegments,recordingFormat} from './local-cutter.js';
test('167 seconds split into 60,60,47 without overlap',()=>assert.deepEqual(planSegments(167,{mode:'batch',count:10,clipDuration:60}),[{start:0,length:60},{start:60,length:60},{start:120,length:47}]));
test('manual ending is clamped to source',()=>assert.deepEqual(planSegments(167,{mode:'single',start:160,duration:60}),[{start:160,length:7}]));
test('invalid range and count are rejected',()=>{for(const options of [{mode:'single',start:167,duration:2},{mode:'single',start:-1,duration:2},{mode:'batch',count:0,clipDuration:30},{mode:'batch',count:99,clipDuration:30},{mode:'batch',count:2,clipDuration:NaN}])assert.throws(()=>planSegments(167,options));});
test('extension matches native encoder format',()=>{assert.equal(recordingFormat({isTypeSupported:t=>t==='video/webm'}).extension,'webm');assert.equal(recordingFormat({isTypeSupported:t=>t==='video/mp4'}).extension,'mp4');assert.throws(()=>recordingFormat({isTypeSupported:()=>false}));});
