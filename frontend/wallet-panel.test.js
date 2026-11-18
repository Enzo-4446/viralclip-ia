import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWalletPanel} from './wallet-panel.js';
test('wallet remains hidden and makes no calls when disabled',async()=>{
 const root={hidden:false};
 const panel=mountWalletPanel({root,sb:{},enabled:false});
 await panel.refresh();assert.equal(root.hidden,true);
});
test('wallet shows paid plus bonus balance and free quota',async()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({textContent:'',setAttribute:()=>{},append(...nodes){this.nodes=nodes}})};
 try{
  const root={hidden:true,replaceChildren(...nodes){this.nodes=nodes},setAttribute:()=>{}};
  const query={maybeSingle:async()=>({data:{paid_cents:500,bonus_cents:250,free_exports_used:2},error:null})};
  const sb={rpc:async()=>({data:false,error:null}),from:()=>({select:()=>({eq:()=>query})}),auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})}};
  const panel=mountWalletPanel({root,sb,enabled:true});await panel.refresh();
  assert.equal(root.hidden,false);
  assert.ok(root.nodes[1].nodes[1].textContent.includes('7,50'));
  assert.ok(root.nodes[1].nodes[2].textContent.includes('Grátis 3'));
  panel.clear();assert.equal(root.nodes[1].nodes[1].textContent,'—');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('verified admin gets infinity but no fake monetary balance',async()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({textContent:'',setAttribute:()=>{},append(...nodes){this.nodes=nodes}})};
 try{
  const root={hidden:true,replaceChildren(...nodes){this.nodes=nodes},setAttribute:()=>{}};
  const sb={rpc:async()=>({data:true,error:null}),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})}};
  await mountWalletPanel({root,sb,enabled:true}).refresh();
  assert.equal(root.nodes[1].nodes[1].textContent,'∞');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
