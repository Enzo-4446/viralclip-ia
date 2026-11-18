import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWalletPanel} from './wallet-panel.js';
test('disabled wallet does not call server',async()=>{
 let called=false;
 const root={hidden:false};
 const panel=mountWalletPanel({root,sb:{rpc:()=>{called=true}},enabled:false});
 await panel.refresh();assert.equal(root.hidden,true);assert.equal(called,false);
});
test('enabled wallet renders balances without purchase actions',async()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({textContent:'',setAttribute(){}})};
 try{
  const root={hidden:true,append(node){this.node=node}};
  const sb={
   rpc(){},
   from(){return {select(){return {eq(){return {maybeSingle:async()=>({data:{paid_cents:500,bonus_cents:250,free_exports_used:2},error:null})})}}}}}},
   auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})}
  };
  const panel=mountWalletPanel({root,sb,enabled:true});
  await panel.refresh();
  assert.match(root.node.textContent,/R\\$\\s?5,00/);
  assert.match(root.node.textContent,/3/);
  panel.clear();assert.equal(root.node.textContent,'');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
