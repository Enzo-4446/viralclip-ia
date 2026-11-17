export const DEFAULT_WATERMARK='GTA.VI.VIRAL';
export function rememberWatermark({sb,input,preset,status,storage=globalThis.localStorage}) {
  let userId=null,timer=null,version=0,applying=false,writes=Promise.resolve();
  const key=id=>'viralclip.watermark.v1.'+id;
  const read=id=>{try{return JSON.parse(storage.getItem(key(id))||'null');}catch{return null;}};
  const cache=(id,value,updatedAt)=>{try{storage.setItem(key(id),JSON.stringify({value,updatedAt}));}catch{}};
  const apply=value=>{applying=true;input.value=value;input.dispatchEvent(new Event('input'));applying=false;};
  function save(){
    clearTimeout(timer);
    const value=input.value.trim().slice(0,32),id=userId,updatedAt=Date.now(),editVersion=version;
    if(!id||!value)return;
    cache(id,value,updatedAt);status.textContent='Última marca lembrada neste navegador. Sincronizando com sua conta...';
    writes=writes.catch(()=>{}).then(async()=>{
      try{
        const {data:{session}}=await sb.auth.getSession();if(session?.user.id!==id)return;
        const {error}=await sb.auth.updateUser({data:{viralclip_watermark:value,viralclip_watermark_updated_at:updatedAt}});if(error)throw error;
        if(userId===id&&version===editVersion)status.textContent='Marca salva na sua conta. Será preenchida automaticamente no próximo acesso.';
      }catch{if(userId===id&&version===editVersion)status.textContent='Marca lembrada neste navegador. Não consegui sincronizar com a conta agora; edite novamente quando a conexão voltar.';}
    });
  }
  input.addEventListener('input',()=>{
    if(applying)return;version++;clearTimeout(timer);
    const value=input.value.trim().slice(0,32);
    if(userId&&value){cache(userId,value,Date.now());status.textContent='Última marca lembrada neste navegador.';timer=setTimeout(save,700);}
  });
  input.addEventListener('change',()=>{if(!applying)save();});
  preset.onclick=()=>{input.value=DEFAULT_WATERMARK;input.dispatchEvent(new Event('input'));save();};
  return {async restore(session){
    const id=session?.user.id||null;if(id===userId)return;
    clearTimeout(timer);userId=id;version++;const snapshot=version;
    if(!id){apply(DEFAULT_WATERMARK);status.textContent='';return;}
    const local=read(id),metadata=session.user.user_metadata||{};
    apply(local?.value||metadata.viralclip_watermark||DEFAULT_WATERMARK);
    try{
      const {data:{user},error}=await sb.auth.getUser();if(error)throw error;
      if(userId!==id||snapshot!==version)return;
      const remote=user.user_metadata||{},remoteTime=Number(remote.viralclip_watermark_updated_at)||0;
      if(local?.value&&Number(local.updatedAt)>remoteTime){apply(local.value);save();}
      else if(remote.viralclip_watermark){apply(remote.viralclip_watermark);cache(id,remote.viralclip_watermark,remoteTime);status.textContent='Última marca restaurada da sua conta.';}
      else {apply(DEFAULT_WATERMARK);status.textContent='GTA.VI.VIRAL disponível como sugestão. Sua última marca será lembrada automaticamente.';}
    }catch{if(userId===id&&snapshot===version)status.textContent='Última marca restaurada neste navegador. Entre com a mesma conta para sincronizar entre dispositivos.';}
  },flush:save,settled:()=>writes};
}
