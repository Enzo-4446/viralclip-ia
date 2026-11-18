import test from 'node:test';
import assert from 'node:assert/strict';
import {changeQuantity,cartTotals,buildDraftOrder} from './store-cart.js';
const uuid='550e8400-e29b-41d4-a716-446655440000';
test('cart totals paid and bonus precisely in integer cents',()=>{
 let cart={};cart=changeQuantity(cart,1000,1);cart=changeQuantity(cart,9990,1);cart=changeQuantity(cart,9990,1);
 assert.deepEqual(cartTotals(cart),{quantity:3,totalCents:20980,paidCents:20980,bonusCents:5000});
 assert.equal(buildDraftOrder(cart,uuid).status,'demo_unpaid');
});
test('cart supports removal without negative quantities',()=>{
 let cart=changeQuantity({},1000,1);cart=changeQuantity(cart,1000,-1);
 assert.equal(cartTotals(cart).quantity,0);
 assert.deepEqual(changeQuantity(cart,1000,-1),{});
});
test('rejects arbitrary prices, tampered quantities and empty checkout',()=>{
 assert.throws(()=>changeQuantity({},1234,1),/inválida/);
 assert.throws(()=>cartTotals({1000:1.5}),/inválido/);
 assert.throws(()=>buildDraftOrder({},uuid),/Adicione/);
 assert.throws(()=>buildDraftOrder({1000:1},'not-a-uuid'),/inválida/);
});
