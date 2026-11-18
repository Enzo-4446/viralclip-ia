export const MAX_SINGLE_BYTES=50*1024*1024;
export const PART_BYTES=24*1024*1024;
export const isMultipart=path=>path.endsWith('.clip.json');
export const originalClipName=name=>name.replace(/\.clip\.json$/,'');
export function validateManifest(manifest,path){
  const folder=path.split('/')[0]+'/_parts/';
  if(manifest?.version!==1||!['video/mp4','video/webm'].includes(manifest.type)||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<=0||!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.length>100)throw Error('O registro deste corte está incompleto. Tente enviá-lo novamente pelo PC.');
  if(manifest.parts.some(part=>typeof part.path!=='string'||!part.path.startsWith(folder)||part.path.includes('..')||!Number.isSafeInteger(part.size)||part.size<=0)||manifest.parts.reduce((sum,p)=>sum+p.size,0)!==manifest.bytes)throw Error('As partes do corte não correspondem ao arquivo original. Tente enviá-lo novamente pelo PC.');
  return manifest;
}
export async function saveClipParts({blob,path,upload,remove,singleLimit=MAX_SINGLE_BYTES,partSize=PART_BYTES}){
  if(blob.size<=singleLimit){await upload(path,blob,0,blob.size);return path;}
  const pieces=[],written=[],base=path.split('/').slice(1).join('_'),user=path.split('/')[0];
  try{
    for(let offset=0,index=0;offset<blob.size;offset+=partSize,index++){
      const part=blob.slice(offset,offset+partSize,'application/octet-stream');
      const partPath=user+'/_parts/'+base+'_'+String(index).padStart(3,'0')+'.part';
      await upload(partPath,part,offset,blob.size);written.push(partPath);pieces.push({path:partPath,size:part.size});
    }
    const manifest={version:1,type:blob.type.split(';')[0]||'video/mp4',bytes:blob.size,parts:pieces};
    const manifestBlob=new Blob([JSON.stringify(manifest)],{type:'application/json'});
    await upload(path+'.clip.json',manifestBlob,blob.size,blob.size);
    return path+'.clip.json';
  }catch(error){if(written.length)try{await remove(written);}catch{}throw error;}
}
export async function readManifest(store,path){const {data,error}=await store.download(path);if(error)throw error;return validateManifest(JSON.parse(await data.text()),path);}
export async function downloadClip(store,path,onProgress=()=>{}){
  if(!isMultipart(path)){const {data,error}=await store.download(path);if(error)throw error;return data;}
  const manifest=await readManifest(store,path),parts=[];let total=0;
  for(let i=0;i<manifest.parts.length;i++){
    const part=manifest.parts[i],{data,error}=await store.download(part.path);if(error)throw error;
    if(data.size!==part.size)throw Error('A parte '+(i+1)+' veio incompleta. Toque em preparar novamente para repetir o download.');
    parts.push(data);total+=data.size;onProgress(Math.round(total/manifest.bytes*100));
  }
  const blob=new Blob(parts,{type:manifest.type});if(blob.size!==manifest.bytes)throw Error('O corte baixado está incompleto. Tente novamente.');return blob;
}
export async function removeClip(store,path){
  const paths=isMultipart(path)?[...(await readManifest(store,path)).parts.map(x=>x.path),path]:[path];
  const {error}=await store.remove(paths);if(error)throw error;
}
