import test from 'node:test';
import assert from 'node:assert/strict';
import {PACKAGES,packageForCents,formatBRL} from './commercial-pricing.js';
test('store has six exact packages and one promotional bonus',()=>{
 assert.deepEqual(PACKAGES.map(p=>p.priceCents),[1000,2000,3000,4000,5000,9990]);
 assert.equal(PACKAGES.filter(p=>p.bonusCents>0).length,1);
 assert.equal(packageForCents(9990).bonusCents,2500);
 assert.equal(packageForCents(1234),null);
});
test('store formats package amounts in BRL',()=>{
 assert.match(formatBRL(9990),/99,90/);
 assert.match(formatBRL(2500),/25,00/);
});
