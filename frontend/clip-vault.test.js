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
