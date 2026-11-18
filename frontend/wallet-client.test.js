import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletClient} from './wallet-client.js';

test('browser cannot reserve or settle before secure server integration',async()=>{
 let called=false;
 const sb={rpc:async()=>{called=true;return {data:{}}},from:()=>({})};
 const wallet=createWalletClient(sb);
 await assert.rejects(wallet.reserve([{length:30}]),/Cobrança bloqueada/);
 await assert.rejects(wallet.finish('reservation',true),/exclusivos do servidor/);
 await assert.rejects(wallet.finish('reservation',false),/exclusivos do servidor/);
 assert.equal(called,false);
});
test('quote remains available without charging',()=>{
 const wallet=createWalletClient({rpc:()=>{},from:()=>{}});
 assert.equal(wallet.quote([{length:45}],0).cents,20);
 assert.equal(wallet.quote([{length:45}],0).free,true);
});
