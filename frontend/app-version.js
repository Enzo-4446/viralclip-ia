export function updateUrl(href,version){
  const url=new URL(href);url.searchParams.set('v',version);return url.href;
}
export function mountVersionNotice({root,version,isBusy,fetchVersion=()=>fetch(new URL(import.meta.env.BASE_URL+'version.json',location.origin),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Versão indisponível');return r.json();}),navigate=url=>location.assign(url),href=()=>location.href}){
  const badge=document.createElement('p');badge.className='subtle-note';badge.textContent='Versão '+version.slice(0,8)+' · corte offline quadro a quadro';
  const notice=document.createElement('div');notice.className='hint';notice.hidden=true;notice.setAttribute('role','status');
  const text=document.createElement('p'),button=document.createElement('button');button.type='button';button.textContent='Carregar versão atualizada';notice.append(text,button);root.prepend(badge,notice);
  let latest=version,checking=false;
  const render=()=>{const busy=isBusy();notice.hidden=latest===version;button.disabled=busy;text.textContent=busy?'Há uma atualização disponível. Aguarde o corte e o envio para sua conta terminarem antes de atualizar.':'Há uma versão nova do site. Clique abaixo para carregá-la. Depois, selecione o arquivo novamente; os cortes salvos na conta continuam disponíveis.';};
  button.onclick=()=>{if(isBusy()){render();return;}navigate(updateUrl(href(),latest));};
  return async()=>{if(checking)return;checking=true;try{const result=await fetchVersion();if(typeof result.version==='string'&&/^[a-zA-Z0-9.-]{1,64}$/.test(result.version))latest=result.version;}catch{}finally{checking=false;render();}};
}
