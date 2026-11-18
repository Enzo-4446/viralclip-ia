import test from 'node:test';import assert from 'node:assert/strict';import {createWalletClient} from './wallet-client.js';
test('reserves with server-side RPC and unique key',async()=>{
 const calls=[];const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'reservation-1'},error:null}},from:()=>({})};
 const wallet=createWalletClient(sb);const result=await wallet.reserve([{length:30}], '550e8400-e29b-41d4-a716-446655440000');
 assert.equal(result.id,'reservation-1');assert.equal(calls[0].name,'viral_reserve_export');assert.deepEqual(calls[0].args.p_segments,[{length:30}]);
});
test('browser cannot request refunds',async()=>{let called=false;const sb={rpc:async()=>{called=true;return {data:{}}},from:()=>({})};await assert.rejects(createWalletClient(sb).finish('reservation',false),/Estornos exigem/);assert.equal(called,false);});
test('does not hide server rejection',async()=>{const sb={rpc:async()=>({error:new Error('Créditos insuficientes')}),from:()=>({})};await assert.rejects(createWalletClient(sb).reserve([{length:60}]),/Créditos insuficientes/);});
