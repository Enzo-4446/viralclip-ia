export function mountLocalHelper({getUrl,rightsChecked}) {
  const $=id=>document.getElementById(id);
  let endpoint=null,token=sessionStorage.getItem('viral_helper_token')||'',jobId=null,abort=null;
  const status=message=>{$('helperStatus').textContent=message};
  const request=async(path,options={})=>{
    if(!endpoint)throw Error('Helper não encontrado.');
    const response=await fetch(endpoint+path,{...options,headers:{...(options.headers||{}),...(token?{Authorization:'Bearer '+token}:{})}});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.detail||'Falha ao conectar com o Helper.')}
    return response;
  };
  async function detectHelper(){
    for(let port=47800;port<=47810;port++){
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),1500);
      try{
        const base='http://127.0.0.1:'+port;
        const response=await fetch(base+'/health',{signal:controller.signal,cache:'no-store'});
        const info=await response.json();
        if(response.ok&&info.ok){endpoint=base;status('Helper encontrado na porta '+port+(info.ffmpeg_ok?' · FFmpeg disponível':' · FFmpeg não instalado')+'.');return true}
      }catch{}finally{clearTimeout(timeout)}
    }
    endpoint=null;status('Helper não encontrado. Instale e execute o Helper ou envie um arquivo MP4.');return false;
  }
  $('helperPair').onclick=async()=>{
    try{
      if(!endpoint&&!await detectHelper())return;
      const code=$('helperPairCode').value.trim();
      if(!/^\d{6}$/.test(code))throw Error('Informe o código de seis dígitos mostrado pelo Helper.');
      const response=await request('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
      token=(await response.json()).token;sessionStorage.setItem('viral_helper_token',token);
      $('helperPairCode').value='';status('Helper conectado e pareado.');
    }catch(e){status(e.message)}
  };
  $('helperImport').onclick=async()=>{
    if(!rightsChecked()){status('Marque a declaração de direitos antes de importar.');return}
    if(!getUrl()){status('Informe um link válido do YouTube.');return}
    if(!token){status('Conecte o Helper com o código de pareamento.');return}
    const count=Number($('helperCount').value),seconds=Number($('helperSeconds').value),gap=Number($('helperGap').value);
    if(![count,seconds,gap].every(Number.isInteger)||count<1||count>50||seconds<5||seconds>180||gap<0||gap>600){status('Confira os limites de quantidade, duração e intervalo.');return}
    $('helperImport').disabled=true;$('helperCancel').hidden=false;
    try{
      if(!endpoint&&!await detectHelper())return;
      const response=await request('/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:getUrl(),clips:{count,seconds,gap},rights_declared:true})});
      jobId=(await response.json()).id;
      abort=new AbortController();
      const events=await request('/jobs/'+encodeURIComponent(jobId)+'/events',{signal:abort.signal});
      const reader=events.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(true){
        const {value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const messages=buffer.split('\n\n');buffer=messages.pop();
        for(const message of messages){
          const line=message.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;
          const data=JSON.parse(line.slice(6));
          $('helperProgress').textContent=data.state==='downloading'?'Baixando: '+(data.percent??0)+'%':data.state==='cutting'?'Cortando '+(data.current||0)+' de '+(data.total||count):data.state==='done'?'Cortes prontos em ~/ViralIA. Abra a pasta no computador.':data.state==='error'?(data.message||'Não foi possível importar.'):'Aguardando processamento...';
        }
      }
    }catch(e){$('helperProgress').textContent=e.message}
    finally{jobId=null;abort=null;$('helperImport').disabled=false;$('helperCancel').hidden=true}
  };
  $('helperCancel').onclick=async()=>{if(!jobId)return;try{await request('/jobs/'+encodeURIComponent(jobId)+'/cancel',{method:'POST'});status('Cancelamento solicitado.')}catch(e){status(e.message)}};
  detectHelper();
  const interval=setInterval(()=>{if(!$('youtubePanel').hidden&&!jobId)detectHelper()},5000);
  window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
  return {detectHelper};
}
