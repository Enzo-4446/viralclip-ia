import test from 'node:test';
import assert from 'node:assert/strict';
import {PACKAGES,priceClipSeconds,priceExport,freeExportEligible,packageForCents} from './commercial-pricing.js';
test('tariff for 30, 60, 90 and 120 seconds',()=>{assert.deepEqual([30,60,90,120].map(priceClipSeconds),[10,20,30,40]);});
test('partial blocks rounded up',()=>{assert.equal(priceClipSeconds(31),20);assert.equal(priceClipSeconds(1),10);});
test('invalid durations rejected',()=>{for(const n of [0,-1,NaN,Infinity])assert.throws(()=>priceClipSeconds(n));});
test('multiple segments',()=>assert.equal(priceExport([{length:30},{length:60},{length:90}]),60));
test('free allowance',()=>{assert.equal(freeExportEligible([{length:60},{length:30}],3),true);assert.equal(freeExportEligible([{length:60},{length:30}],4),false);assert.equal(freeExportEligible([{length:61}],0),false);});
test('catalogue and bonus',()=>{assert.deepEqual(PACKAGES.map(p=>p.priceCents),[1000,2000,3000,4000,5000,9990]);assert.equal(packageForCents(9990).bonusCents,2500);assert.equal(packageForCents(1000).bonusCents,0);assert.equal(packageForCents(1990),null);});
