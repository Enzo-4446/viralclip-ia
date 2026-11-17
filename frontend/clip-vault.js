import {Upload} from 'tus-js-client';
export const CLIP_BUCKET='clip-exports';
export const MAX_CLIP_BYTES=50*1024*1024;
export function clipObjectName(userId,title,name,id=crypto.randomUUID(),now=Date.now()) {
  if(!/^[a-f0-9-]{36}$/i.test(userId))throw Error('Conta inválida. Entre novamente.');
  const extension=name.toLowerCase().endsWith('.webm')?'webm':'mp4';
  const safe=(title||'Meu clipe').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60);
  return userId+'/'+now+'_'+id+'_'+safe+'_'+name.replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/\.(mp4|webm)$/i,'')+'.'+extension;
}
export function clipLabel(name){return name.replace(/^\d+_[a-f0-9-]{36}_/i,'').replace(/_/g,' ');}
export function createClipVault({sb,url,root,message,refreshButton,pendingRoot,UploadClient=Upload}) {
  let loadSequence=0;
  const endpoint=url.replace(/\.supabase\.co\/?$/,'.storage.supabase.co')+'/storage/v1/upload/resumable';
  async function currentUser(){const {data:{session},error}=await sb.auth.getSession();if(error||!session)throw Error('Entre na mesma conta para acessar os cortes.');return session;}
  async function load(){
    const sequence=++loadSequence;
    try{
      const session=await currentUser();
      const files=[];let offset=0;
      while(true){const {data,error}=await sb.storage.from(CLIP_BUCKET).list(session.user.id,{limit:100,offset,sortBy:{column:'name',order:'desc'}});if(error)throw error;files.push(...data.filter(x=>x.id));if(data.length<100)break;offset+=100;}
      if(sequence!==loadSequence)return;
      root.replaceChildren();
      if(!files.length){const p=document.createElement('p');p.textContent='Seus cortes salvos aparecerão aqui, também no iPad com a mesma conta.';root.append(p);return;}
      for(const file of files){
        const path=session.user.id+'/'+file.name;
        const card=document.createElement('article');card.className='result-card saved-clip';
        const title=document.createElement('p');title.textContent=clipLabel(file.name);
        const detail=document.createElement('small');detail.textContent=new Date(file.created_at).toLocaleString('pt-BR')+' · '+((file.metadata?.size||0)/1048576).toFixed(1)+' MB';
        const info=document.createElement('p');info.className='subtle-note';
        const prepare=document.createElement('button');prepare.type='button';prepare.className='button-secondary';prepare.textContent='Abrir / baixar vídeo';
        const remove=document.createElement('button');remove.type='button';remove.className='delete-clip';remove.textContent='Apagar da minha conta';
        const links=document.createElement('div');
        prepare.onclick=async()=>{prepare.disabled=true;info.textContent='Preparando acesso privado...';try{
          const user=await currentUser();if(user.user.id!==session.user.id)throw Error('A conta mudou. Atualize a lista.');
          const store=sb.storage.from(CLIP_BUCKET);
          const [view,download]=await Promise.all([store.createSignedUrl(path,3600),store.createSignedUrl(path,3600,{download:file.name})]);
          if(view.error||download.error)throw view.error||download.error;
          const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=view.data.signedUrl;
          const open=document.createElement('a');open.href=view.data.signedUrl;open.target='_blank';open.rel='noopener';open.textContent='Abrir vídeo no iPad';
          const save=document.createElement('a');save.href=download.data.signedUrl;save.download=file.name;save.textContent='Baixar vídeo';
          links.replaceChildren(video,save,open);info.textContent='No iPad: baixe em Arquivos ou abra o vídeo e use Compartilhar → Salvar Vídeo, quando disponível. Apague da conta apenas depois de conferir o arquivo.';
        }catch(error){info.textContent='Falha ao abrir: '+error.message;}finally{prepare.disabled=false;}};
        remove.onclick=async()=>{if(!window.confirm('Apagar este corte da sua conta? Ele deixará de aparecer no PC e no iPad. Confira se já salvou uma cópia.'))return;remove.disabled=true;try{const user=await currentUser();if(user.user.id!==session.user.id)throw Error('A conta mudou. Atualize a lista.');const {error}=await sb.storage.from(CLIP_BUCKET).remove([path]);if(error)throw error;links.querySelector('video')?.pause();card.remove();message.textContent='Corte apagado da conta.';}catch(error){info.textContent='Não foi possível apagar: '+error.message;remove.disabled=false;}};
        card.append(title,detail,prepare,links,info,remove);root.append(card);
      }
    }catch(error){if(sequence===loadSequence)message.textContent='Não foi possível carregar os cortes salvos: '+error.message;}
  }
  async function saveFiles(files,title,userId,signal){
    let saved=0;
    for(const file of files){
      const blob=file.blob||new Blob([file.bytes],{type:file.type||'video/mp4'});
      const path=clipObjectName(userId,title,file.name);
      const row=document.createElement('div');row.className='pending-clip';
      const text=document.createElement('span');
      const retry=document.createElement('button');retry.type='button';retry.className='button-secondary';retry.textContent='Tentar salvar novamente';retry.hidden=true;
      row.append(text,retry);pendingRoot.append(row);
      let completed=false;
      async function upload(abortSignal){
        retry.hidden=true;text.textContent=file.name+' · enviando para sua conta...';
        try{
          if(blob.size>MAX_CLIP_BYTES)throw Error('Este corte ultrapassa 50 MB. Baixe a cópia local ou gere um trecho menor.');
          const session=await currentUser();if(session.user.id!==userId)throw Error('Entre na conta em que este corte foi gerado.');
          await new Promise((resolve,reject)=>{
            let settled=false;
            const finish=error=>{if(settled)return;settled=true;abortSignal?.removeEventListener('abort',abort);error?reject(error):resolve();};
            const abort=()=>{task.abort().catch(()=>{});finish(Error('Envio cancelado. Use Tentar salvar novamente.'));};
            const task=new UploadClient(blob,{endpoint,retryDelays:[0,1000,3000,5000],headers:{authorization:'Bearer '+session.access_token},metadata:{bucketName:CLIP_BUCKET,objectName:path,contentType:blob.type.split(';')[0]||'video/mp4',cacheControl:'0'},chunkSize:6*1024*1024,uploadDataDuringCreation:true,storeFingerprintForResuming:false,removeFingerprintOnSuccess:true,onError:finish,onProgress:(bytes,total)=>{text.textContent=file.name+' · salvando na conta: '+Math.round(bytes/total*100)+'%';},onSuccess:()=>finish()});
            if(abortSignal?.aborted){abort();return;}abortSignal?.addEventListener('abort',abort,{once:true});task.start();
          });
          completed=true;text.textContent=file.name+' · salvo na conta ✓ Disponível no iPad.';return true;
        }catch(error){text.textContent=file.name+' · NÃO salvo: '+error.message+' A cópia local continua disponível enquanto esta página permanecer aberta.';retry.hidden=false;return false;}
      }
      retry.onclick=async()=>{retry.disabled=true;try{if(!completed)await upload();await load();}finally{retry.disabled=false;}};
      if(await upload(signal))saved++;
    }
    message.textContent=saved===files.length?saved+' corte(s) salvo(s). Entre nesta mesma conta no iPad para baixar.':saved+' de '+files.length+' corte(s) salvo(s). Verifique os envios pendentes acima.';
    await load();return saved;
  }
  refreshButton.onclick=load;
  return {load,saveFiles,clear(){++loadSequence;root.querySelectorAll('video').forEach(v=>v.pause());root.replaceChildren();pendingRoot.replaceChildren();message.textContent='';}};
}
