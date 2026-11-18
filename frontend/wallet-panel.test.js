import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWalletPanel} from './wallet-panel.js';
test('wallet remains hidden and makes no calls when disabled',async()=>{
 const root={hidden:false};
 const panel=mountWalletPanel({root,sb:{},enabled:false});
 await panel.refresh();
 assert.equal(root.hidden,true);
});
test('wallet shows a read-only balance for authenticated account',async()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({textContent:'',setAttribute:()=>{}})};
 try{
  const root={hidden:true,append(node){this.node=node}};
  const query={maybeSingle:async()=>({data:{paid_cents:500,bonus_cents:250,free_exports_used:2},error:null})};
  const sb={
   rpc:async()=>({data:null}),
   from:()=>({select:()=>({eq:()=>query})}),
   auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})}
  };
  const panel=mountWalletPanel({root,sb,enabled:true});
  await panel.refresh();
  assert.equal(root.hidden,false);
  assert.ok(root.node.textContent.includes('5,00'));
  assert.ok(root.node.textContent.includes('3'));
  panel.clear();
  assert.equal(root.node.textContent,'');
 }finally{
  if(previous===undefined)delete globalThis.document;
  else globalThis.document=previous;
 }
});
