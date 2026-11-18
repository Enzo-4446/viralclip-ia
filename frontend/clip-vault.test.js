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
  ipadPreset.onclick();await ipad.settled();assert.equal(ipadInput.value,'@GTA.VI.RAL');assert.equal(remote.user_metadata.viralclip_watermark,'@GTA.VI.RAL');
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


import {saveClipParts,downloadClip,removeClip,validateManifest} from './clip-transfer.js';
test('large clips round-trip as identical bytes without recompression and delete all parts',async()=>{
  const storage=new Map(),bytes=new Uint8Array([1,2,3,4,5,6,7,8,9,10]);
  const blob=new Blob([bytes],{type:'video/mp4'}),path=uid+'/test.mp4';
  const store={download:async path=>({data:storage.get(path),error:null}),remove:async paths=>{paths.forEach(path=>storage.delete(path));return {error:null};}};
  const saved=await saveClipParts({blob,path,singleLimit:5,partSize:4,upload:async(path,part)=>storage.set(path,part),remove:paths=>store.remove(paths)});
  assert.equal(saved,path+'.clip.json');assert.equal(storage.size,4);
  const result=await downloadClip(store,saved);assert.equal(result.type,'video/mp4');assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
  await removeClip(store,saved);assert.equal(storage.size,0);
});
test('failed multipart upload never publishes a manifest and cleans completed parts',async()=>{
  const storage=new Map();let count=0;
  await assert.rejects(saveClipParts({blob:new Blob(['1234567890'],{type:'video/mp4'}),path:uid+'/test.mp4',singleLimit:5,partSize:4,upload:async(path,blob)=>{if(++count===2)throw Error('Network');storage.set(path,blob);},remove:async paths=>paths.forEach(path=>storage.delete(path))}));
  assert.equal(storage.size,0);
});
test('manifest cannot refer to another account folder',()=>assert.throws(()=>validateManifest({version:1,type:'video/mp4',bytes:4,parts:[{path:'other/_parts/part',size:4}]},uid+'/test.mp4.clip.json')));
