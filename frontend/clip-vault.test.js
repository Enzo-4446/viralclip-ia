import test from 'node:test';
import assert from 'node:assert/strict';
import {clipObjectName,clipLabel,createClipVault} from './clip-vault.js';
const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function element(){return {children:[],textContent:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},querySelectorAll(){return [];}};}
test('saved clip paths are private to user folder and reject path traversal',()=>{const path=clipObjectName(uid,'../Meu título','../video.mp4','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',123);assert.equal(path.split('/').length,2);assert.ok(path.startsWith(uid+'/'));assert.ok(path.endsWith('.mp4'));assert.ok(clipLabel(path.split('/')[1]).includes('Meu titulo')); assert.throws(()=>clipObjectName('../another-user','Title','clip.mp4'));});
test('failed upload remains retryable and appears on another device after retry',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:element};
  try{
    let fail=true;const stored=[];
    const sb={auth:{getSession:async()=>({data:{session:{user:{id:uid},access_token:'test-token'}}})},storage:{from:()=>({list:async()=>({data:stored,error:null})})}};
    class FakeUpload{constructor(blob,options){this.options=options;this.blob=blob;}start(){if(fail){this.options.onError(Error('network unavailable'));return;}stored.push({id:'saved',name:this.options.metadata.objectName.split('/')[1],created_at:new Date().toISOString(),metadata:{size:this.blob.size}});this.options.onSuccess();}}
    const pending=element(),root=element(),message=element();
    const vault=createClipVault({sb,url:'https://example.supabase.co',root,message,refreshButton:element(),pendingRoot:pending,UploadClient:FakeUpload});
    assert.equal(await vault.saveFiles([{name:'clip.mp4',blob:new Blob(['test'],{type:'video/mp4'})}],'Demo',uid),0);
    const retry=pending.children[0].children[1];assert.equal(retry.hidden,false);assert.match(pending.children[0].children[0].textContent,/NÃO salvo/);
    fail=false;await retry.onclick();assert.equal(stored.length,1);
    const otherRoot=element();const ipad=createClipVault({sb,url:'https://example.supabase.co',root:otherRoot,message:element(),refreshButton:element(),pendingRoot:element()});
    await ipad.load();assert.equal(otherRoot.children.length,1);assert.equal(otherRoot.children[0].className,'result-card saved-clip');
  }finally{globalThis.document=previousDocument;}
});

import {rememberWatermark,DEFAULT_WATERMARK} from './watermark-preference.js';
test('last custom watermark restores on another device and GTA preset stays available',async()=>{
  class Input extends EventTarget{value='';}
  const remote={id:uid,user_metadata:{}};
  const session={user:{id:uid,user_metadata:{}}};
  const sb={auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:remote}}),updateUser:async({data})=>{Object.assign(remote.user_metadata,data);return {error:null};}}};
  const makeStorage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};
  const input=new Input(),preset={},status={};
  const first=rememberWatermark({sb,input,preset,status,storage:makeStorage()});
  await first.restore(session);assert.equal(input.value,DEFAULT_WATERMARK);
  input.value='MINHA MARCA';input.dispatchEvent(new Event('input'));first.flush();await first.settled();
  const ipadInput=new Input(),ipadPreset={};
  const ipad=rememberWatermark({sb,input:ipadInput,preset:ipadPreset,status:{},storage:makeStorage()});
  await ipad.restore(session);assert.equal(ipadInput.value,'MINHA MARCA');
  ipadPreset.onclick();await ipad.settled();assert.equal(ipadInput.value,'GTA.VI.VIRAL');assert.equal(remote.user_metadata.viralclip_watermark,'GTA.VI.VIRAL');
});

import {attachClipSharing} from './share-clip.js';
test('native sharing sends the actual MP4 on a second click without refetching',async()=>{
  const button={},info={};let loads=0,shared=null;
  const nav={canShare:({files})=>files[0].type==='video/mp4',share:async data=>{shared=data;}};
  attachClipSharing({button,info,name:'clip.mp4',nav,getBlob:async()=>{loads++;return new Blob(['video'],{type:'video/mp4'});}});
  await button.onclick();assert.equal(loads,1);assert.equal(shared,null);assert.match(button.textContent,/2\./);
  await button.onclick();assert.equal(loads,1);assert.equal(shared.files[0].name,'clip.mp4');assert.equal(shared.files[0].type,'video/mp4');assert.equal('url' in shared,false);
});
test('canceling native share leaves clip prepared for retry',async()=>{
  const button={},info={};let attempts=0;
  attachClipSharing({button,info,name:'clip.mp4',nav:{canShare:()=>true,share:async()=>{attempts++;throw new DOMException('Canceled','AbortError');}},getBlob:async()=>new Blob(['video'])});
  await button.onclick();await button.onclick();assert.match(info.textContent,/cancelado/);assert.equal(button.disabled,false);await button.onclick();assert.equal(attempts,2);
});
