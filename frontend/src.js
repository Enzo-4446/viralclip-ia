import {rememberWatermark} from './watermark-preference.js';
import {mountVersionNotice} from './app-version.js';
import {createClipVault} from './clip-vault.js';
import '@fontsource-variable/manrope';
import {mountTimeline} from './timeline.js';
import {cutLocally,planSegments} from './local-cutter.js';
import {unzipSync} from 'fflate';
import {createClient} from '@supabase/supabase-js';
const env=import.meta.env;
const sb=createClient(env.VITE_SUPABASE_URL||'https://zltpldhnaqiqkoqdiugp.supabase.co',env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_rfDyhC0aRYFk4QEnm3py1A_se2B2pJi');
const api=(env.VITE_API_URL||'https://viralclip-ia.onrender.com').replace(/\/$/,'');
const authRedirectUrl='https://enzo-4446.github.io/viralclip-ia/';
const $=id=>document.getElementById(id);
let watermarkPreference=null;
const vault=createClipVault({sb,url:env.VITE_SUPABASE_URL||'https://zltpldhnaqiqkoqdiugp.supabase.co',root:$('savedClips'),message:$('savedClipsStatus'),refreshButton:$('refreshSavedClips'),pendingRoot:$('pendingClips')});
window.addEventListener('error',e=>{const s=$('authStatus');if(s)s.textContent='Erro de inicialização: '+e.message});
window.addEventListener('unhandledrejection',e=>{const s=$('authStatus');if(s)s.textContent='Falha de conexão: '+(e.reason?.message||String(e.reason))});
async function refresh(){const {data:{session}}=await sb.auth.getSession();$('auth').hidden=!!session;$('app').hidden=!session;if(session){await watermarkPreference?.restore(session);await loadProjects();await vault.load();}else{await watermarkPreference?.restore(null);vault.clear();clearResults();}}
async function loadProjects(){const {data,error}=await sb.from('clip_projects').select('title,created_at').order('created_at',{ascending:false}).limit(20);$('projects').textContent=error?error.message:(data?.map(x=>x.title+' — '+new Date(x.created_at).toLocaleDateString('pt-BR')).join('\n')||'Nenhum projeto ainda.');$('projects').style.whiteSpace='pre-line';}
const bindVisibility=(buttonId,inputId)=>{$(buttonId).onclick=()=>{const input=$(inputId),show=input.type==='password';input.type=show?'text':'password';$(buttonId).textContent=show?'Ocultar':'Ver';$(buttonId).setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');$(buttonId).setAttribute('aria-pressed',String(show))}};
bindVisibility('togglePassword','password');
bindVisibility('toggleNewPassword','newPassword');
let recoveryMode=false;
$('forgotPassword').onclick=async()=>{const email=$('email').value.trim();if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){$('authStatus').textContent='Informe seu e-mail no campo acima para recuperar a senha.';return}const btn=$('forgotPassword');btn.disabled=true;$('authStatus').textContent='Solicitando recuperação...';try{const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl});$('authStatus').textContent=error?'Não foi possível enviar: '+error.message:'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.'}catch(e){$('authStatus').textContent='Falha de conexão: '+e.message}finally{btn.disabled=false}};
$('saveNewPassword').onclick=async()=>{const password=$('newPassword').value;if(password.length<6){$('authStatus').textContent='A nova senha deve ter pelo menos 6 caracteres.';return}const btn=$('saveNewPassword');btn.disabled=true;$('authStatus').textContent='Salvando nova senha...';try{const {error}=await sb.auth.updateUser({password});if(error)throw error;recoveryMode=false;$('resetBox').hidden=true;$('newPassword').value='';$('authStatus').textContent='Senha atualizada. Você já pode usar sua conta.';await refresh()}catch(e){$('authStatus').textContent='Não foi possível redefinir: '+e.message}finally{btn.disabled=false}};
const credentials=()=>{const email=$('email').value.trim(),password=$('password').value;if(!email||!password){$('authStatus').textContent='Preencha seu e-mail e sua senha antes de continuar.';return null}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){$('authStatus').textContent='Informe um e-mail válido.';return null}if(password.length<6){$('authStatus').textContent='A senha deve ter pelo menos 6 caracteres.';return null}return {email,password}};
$('signin').onclick=async()=>{const values=credentials();if(!values)return;$('authStatus').textContent='Entrando...';try{const {error}=await sb.auth.signInWithPassword(values);$('authStatus').textContent=error?.message||'Autenticado';if(!error)await refresh()}catch(e){$('authStatus').textContent=e.message}};
$('signup').onclick=async()=>{const values=credentials();if(!values)return;$('authStatus').textContent='Criando conta...';try{const {error}=await sb.auth.signUp({...values,options:{emailRedirectTo:authRedirectUrl}});$('authStatus').textContent=error?.message||'Conta criada. Verifique seu e-mail se a confirmação estiver habilitada.';if(!error)await refresh()}catch(e){$('authStatus').textContent=e.message}};
$('signout').onclick=async()=>{await sb.auth.signOut();await refresh()};
let localBusy=false,localController=null,manualTimeline=null;
const checkVersion=mountVersionNotice({root:document.querySelector('main'),version:__APP_VERSION__,isBusy:()=>localBusy});
checkVersion();window.addEventListener('focus',checkVersion);setInterval(checkVersion,120000);
let sourceMode='upload';let localPreviewUrl=null;let importedYoutubeFile=null;
const setSourceMode=mode=>{if(localBusy)return;sourceMode=mode;$('youtubePanel').hidden=mode!=='youtube';$('uploadPanel').hidden=mode!=='upload';$('tabYoutube').classList.toggle('active',mode==='youtube');$('tabUpload').classList.toggle('active',mode==='upload');$('status').textContent='';$('download').hidden=true;const engine=$('processingEngine');if(engine){engine.disabled=mode==='youtube';$('localNote').textContent=mode==='youtube'?'Links do YouTube usam o servidor. Para corte local, envie um arquivo MP4 do computador.':engine.value==='local'?'O vídeo é cortado neste dispositivo. Depois, apenas os cortes prontos são enviados para sua conta.':'Edição avançada: o vídeo será enviado ao servidor Render.';}updateGenerateState()};
$('tabYoutube').onclick=()=>setSourceMode('youtube');$('tabUpload').onclick=()=>setSourceMode('upload');
const youtubeId=url=>{try{const u=new URL(url);const h=u.hostname.toLowerCase();if(h==='youtu.be'||h==='www.youtu.be')return u.pathname.split('/')[1]?.match(/^[a-zA-Z0-9_-]{11}$/)?.[0]||null;if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(h)){const id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/)?.[1];return id&&/^[a-zA-Z0-9_-]{11}$/.test(id)?id:null}}catch{}return null};
$('inspectYoutube').onclick=()=>{const id=youtubeId($('youtubeUrl').value.trim());if(!id){$('youtubeInfo').textContent='Link inválido. Cole uma URL de vídeo, Shorts ou live do YouTube.';return}if(localPreviewUrl){URL.revokeObjectURL(localPreviewUrl);localPreviewUrl=null}const iframe=document.createElement('iframe');iframe.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id);iframe.title='Prévia do YouTube';iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';iframe.allowFullscreen=true;iframe.style.cssText='width:100%;height:100%;border:0';$('videoPreview').replaceChildren(iframe);$('youtubeInfo').textContent='Vídeo identificado: '+id+'. Prévia disponível quando o YouTube permitir incorporação. Para gerar, confirme os direitos de edição e escolha suas configurações. A disponibilidade depende das restrições do YouTube.'};
$('file').onchange=()=>{importedYoutubeFile=null;const file=$('file').files[0];if(localPreviewUrl)URL.revokeObjectURL(localPreviewUrl);if(!file)return;localPreviewUrl=URL.createObjectURL(file);const video=document.createElement('video');video.src=localPreviewUrl;video.controls=true;video.playsInline=true;$('videoPreview').replaceChildren(video);$('status').textContent='Arquivo selecionado: '+file.name};
const localEngine=()=>$('processingEngine').value==='local';
$('processingEngine').onchange=()=>{
  const local=localEngine();
  for(const id of ['aspect','quality','fps','crf','framing','captions','captionLanguage','captionStyle','recordVoice','voiceFile','ducking','originalVolume','duckDb','releaseMs'])$(id).disabled=local;
  $('watermark').disabled=localBusy;$('brand').disabled=localBusy||!$('watermark').checked;
  $('settingsSummary').textContent=local?'Corte local: áudio e vídeo, resolução original e corte offline quadro a quadro, proporção original e marca dourada opcional. Você escolhe quantos segundos ignorar no início e no final. Duração fixa. Saída MP4 para iPad e TikTok.':'Edição pelo servidor selecionada.';
  $('localNote').textContent=local?'Vídeo e áudio processados neste dispositivo. Os cortes prontos são enviados para sua conta para baixar em outros dispositivos. Processamento offline quadro a quadro, resolução original, incluindo Full HD, proporção original e marca dourada opcional. Você escolhe quantos segundos ignorar no início e no final. Duração fixa. Saída MP4 para iPad e TikTok. Mantenha esta aba visível.':'Edição avançada usa o Render e permite enquadramento vertical, marca e legendas quando configuradas.';
};
async function generateLocal(f,title,session){
  const status=message=>$('status').textContent=message;
  if(localBusy)return;
  if($('watermark').checked&&!$('brand').value.trim()){status('Informe o nome da marca d’água.');return;}
  const selections=$('mode').value==='single'?manualTimeline?.getSelections():undefined;
  document.querySelectorAll('video').forEach(video=>video.pause());
  localBusy=true;localController=new AbortController();manualTimeline?.setBusy(true);
  $('resetClipRange').hidden=true;
  $('cancelLocal').hidden=false;
  updateGenerateState();
  try{
    const result=await cutLocally(f,{mode:$('mode').value,count:Number($('count').value),clipDuration:Number($('clipDuration').value),watermark:$('watermark').checked,brand:$('brand').value.trim(),selections,trimStart:Number($('trimStart').value),trimEnd:Number($('trimEnd').value),start:$('mode').value==='single'?Number($('trimStart').value):$('start').value,end:$('end').value===''?null:Number($('end').value),duration:Number($('duration').value)},status,localController.signal);
    clearResults();
    for(const item of result.files){
      const blob=item.blob;
      const url=URL.createObjectURL(blob);resultUrls.push(url);
      const card=document.createElement('div'),video=document.createElement('video'),p=document.createElement('p'),link=document.createElement('a');
      video.src=url;video.controls=true;video.playsInline=true;video.preload='none';
      p.textContent=item.name;link.href=url;link.download=item.name;link.textContent='Baixar '+result.extension.toUpperCase();
      card.className='result-card';card.append(video,p,link);$('results').append(card);
    }
    if(result.blob){
      const url=URL.createObjectURL(result.blob);resultUrls.push(url);
      $('download').href=url;$('download').download=result.zip?'viralclip_cortes.zip':'viralclip.'+result.extension;
      $('download').textContent=result.zip?'Baixar todos em ZIP':'Baixar '+result.extension.toUpperCase();$('download').hidden=false;
    }else{$('download').hidden=true;}
    status(result.files.length+' clipe(s) gerado(s) localmente. Salvando os vídeos prontos na sua conta; mantenha esta página aberta até concluir. '+(result.notice||''));
    const saved=await vault.saveFiles(result.files,title,session.user.id,localController.signal);
    status(result.files.length+' clipe(s) gerado(s). '+saved+' salvo(s) na conta para baixar no iPad. '+(saved<result.files.length?'Verifique os envios pendentes; os downloads locais continuam disponíveis.':''));
    const {error}=await sb.from('clip_projects').insert({user_id:session.user.id,title,watermark_text:$('watermark').checked?$('brand').value.trim():'',rights_confirmed:true,source_kind:'upload'});
    if(error)console.warn('Histórico:',error.message);
    await loadProjects();
  }catch(e){status('Não foi possível concluir.\n\n'+(e?.message||String(e)||'Tente selecionar o vídeo novamente.'));$('resetClipRange').hidden=!e?.resetRange;console.error(e)}
  finally{localBusy=false;localController=null;manualTimeline?.setBusy(false);$('cancelLocal').hidden=true;updateGenerateState()}
}
$('cancelLocal').onclick=()=>localController?.abort();
$('generate').onclick=async()=>{if(localBusy)return;const f=$('file').files[0]||importedYoutubeFile;if(sourceMode==='upload'&&!f){$('status').textContent='Selecione um vídeo.';return}if(sourceMode==='youtube'&&!youtubeId($('youtubeUrl').value.trim())){$('status').textContent='Cole um link válido do YouTube.';return}if(sourceMode==='youtube'&&!$('rights').checked){$('status').textContent='Confirme que você tem autorização para editar o vídeo.';return}const {data:{session}}=await sb.auth.getSession();if(!session){$('status').textContent='Faça login novamente.';return}const brand=$('brand').value.trim(),title=$('title').value.trim();if(sourceMode==='upload'&&localEngine()){if(!title){$('status').textContent='Informe o título do projeto.';return}await generateLocal(f,title,session);return}if(!api){$('status').textContent='Servidor FFmpeg indisponível.';return}if(!title||($('watermark').checked&&!brand)){$('status').textContent='Informe título e, se ativada, a marca.';return}if($('captions').checked){try{const capsResponse=await fetch(api+'/capabilities',{headers:{Authorization:'Bearer '+session.access_token}});if(capsResponse.ok){const caps=await capsResponse.json();if(!caps.captions){$('status').textContent='O servidor não possui transcrição configurada. Desative Legendas automáticas para gerar o vídeo.';return}}}catch(e){console.warn('Capacidades indisponíveis',e)}}if(sourceMode==='youtube'){
  $('generate').disabled=true;
  $('status').textContent='Verificando se o servidor consegue acessar o vídeo antes de criar o projeto...';
  try{
    const checkBody=new FormData();checkBody.append('url',$('youtubeUrl').value.trim());
    const checkResponse=await fetch(api+'/youtube/check',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:checkBody});
    const check=await checkResponse.json().catch(()=>({}));
    if(!checkResponse.ok)throw Error(check.detail||'Verificação do YouTube indisponível');
    $('youtubeCheck').textContent=(check.status==='available'?'✓ ':'⚠ ')+check.message;
    if(check.status==='blocked')throw Error('Não foi possível gerar: o YouTube está bloqueando o acesso deste servidor. Nenhum projeto foi criado.');
    if(check.status==='unknown')throw Error('A verificação não confirmou o acesso. Tente verificar novamente; nenhum projeto foi criado.');
  }catch(e){$('status').textContent=e instanceof TypeError?'Falha de conexão com o servidor. Nenhum projeto foi criado.':e.message;updateGenerateState();return}
}
const fd=new FormData();if(sourceMode==='youtube'){fd.append('url',$('youtubeUrl').value.trim());fd.append('rights_confirmed','true')}else fd.append('file',f);fd.append('brand',$('watermark').checked?brand:'VIRALCLIP');if(sourceMode!=='youtube'&&$('mode').value==='single'){fd.append('start',$('start').value);fd.append('duration',$('duration').value);}fd.append('settings',JSON.stringify({...Object.fromEntries(editorFields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).type==='number'||['quality','fps','crf'].includes(id)?Number($(id).value):$(id).value])),watermark:$('watermark').checked,aspect:$('aspect').value,count:Number($('count').value),clipDuration:Number($('clipDuration').value)}));if(voiceBlob&&sourceMode==='upload')fd.append('voice',voiceBlob,voiceBlob.name||'narration.webm');$('generate').disabled=true;$('status').textContent='Conectando ao servidor de processamento. A primeira inicialização pode levar cerca de um minuto; mantenha a página aberta.';try{const controller=new AbortController();const timeoutMs=600000;const timeout=setTimeout(()=>controller.abort(),timeoutMs);let r;try{
 if(sourceMode==='upload'){
   fd.append('mode',$('mode').value);
   r=await fetch(api+'/jobs/upload',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:fd,signal:controller.signal});
   if(r.ok){
     const created=await r.json();const jobId=created.job_id;
     $('status').textContent='Vídeo recebido. Processamento iniciado.';
     const started=Date.now();
     while(true){
       if(Date.now()-started>540000)throw Error('O servidor excedeu 9 minutos. O processamento pode continuar; tente novamente com um clipe menor.');
       await new Promise(resolve=>setTimeout(resolve,2500));
       const check=await fetch(api+'/jobs/'+jobId,{headers:{Authorization:'Bearer '+session.access_token},signal:controller.signal});
       if(!check.ok)throw Error('Não foi possível consultar o processamento (HTTP '+check.status+').');
       const job=await check.json();
       $('status').textContent=job.stage||job.message||'Processando vídeo...';
       if(job.state==='failed')throw Error(job.error||job.message||'Falha no processamento');
       if(job.state==='finished'||job.state==='done'){
         r=await fetch(api+'/jobs/'+jobId+'/download',{headers:{Authorization:'Bearer '+session.access_token},signal:controller.signal});
         break;
       }
     }
   }
 }else{
   r=await fetch(api+'/clips/youtube',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:fd,signal:controller.signal});
 }
}finally{clearTimeout(timeout)}if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.detail||'Erro '+r.status)}const blob=await r.blob();clearResults();if(sourceMode==='youtube'||$('mode').value==='batch'){try{const entries=unzipSync(new Uint8Array(await blob.arrayBuffer()));const clips=Object.keys(entries).filter(name=>name.endsWith('.mp4')).sort();for(const [index,name] of clips.entries()){const videoBlob=new Blob([entries[name]],{type:'video/mp4'});const url=URL.createObjectURL(videoBlob);resultUrls.push(url);const card=document.createElement('div');card.className='result-card';const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='none';const title=document.createElement('p');title.textContent='Clipe '+String(index+1).padStart(2,'0');const link=document.createElement('a');link.href=url;link.download=name;link.textContent='Baixar MP4';card.append(video,title,link);$('results').append(card)}if(clips.length===0)throw Error('ZIP sem vídeos');$('status').textContent=clips.length+' clipes prontos. Baixe individualmente ou todos em ZIP.'}catch(e){$('status').textContent='ZIP gerado, mas não foi possível abrir as prévias: '+e.message}}$('download').href=URL.createObjectURL(blob);$('download').download=(sourceMode==='youtube'||$('mode').value==='batch')?'viralclip_cortes.zip':'viralclip.mp4';$('download').textContent=(sourceMode==='youtube'||$('mode').value==='batch')?'Baixar cortes em ZIP':'Baixar MP4';$('download').hidden=false;if(sourceMode!=='youtube'&&$('mode').value==='single'){$('status').textContent='Clipe pronto para baixar.';const url=$('download').href;const card=document.createElement('div');card.className='result-card';const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;card.append(video);$('results').append(card)}const cloudFiles=[];if(sourceMode==='youtube'||$('mode').value==='batch'){const entries=unzipSync(new Uint8Array(await blob.arrayBuffer()));for(const [name,bytes] of Object.entries(entries))if(/\.(mp4|webm)$/i.test(name))cloudFiles.push({name,blob:new Blob([bytes],{type:name.endsWith('.webm')?'video/webm':'video/mp4'})});}else cloudFiles.push({name:'viralclip.mp4',blob});if(cloudFiles.length)await vault.saveFiles(cloudFiles,title,session.user.id);const {error:historyError}=await sb.from('clip_projects').insert({user_id:session.user.id,title,watermark_text:brand,rights_confirmed:true,source_kind:sourceMode==='youtube'?'youtube':'upload'});if(historyError)console.warn('Histórico não salvo:',historyError.message);await loadProjects()}catch(e){$('status').textContent=e?.name==='AbortError'?'O processamento ultrapassou o tempo limite. Tente 1 corte em 720p, 30 FPS, sem legendas. Nenhum histórico foi salvo.':e instanceof TypeError?'Falha de rede ao comunicar com o Render. Pode ser serviço suspenso, deploy com erro, conexão interrompida ou CORS. Confira o status em '+api+'/health e os logs no Render.':(e?.message||String(e)||'Erro desconhecido')}finally{updateGenerateState()}};
sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;$('auth').hidden=false;$('app').hidden=true;$('resetBox').hidden=false;$('authStatus').textContent='Informe uma nova senha para concluir a recuperação.';return}if(!recoveryMode)setTimeout(refresh,0)});refresh();

$('mode').onchange=()=>{$('generate').textContent=$('mode').value==='batch'?'Gerar clipes':'Cortar seleção manual';$('start').disabled=false;$('duration').disabled=$('mode').value==='batch';$('download').hidden=true};$('mode').onchange();


// Professional editor: safe local recording and explicit render capability notices.
let voiceRecorder=null,voiceChunks=[],voiceUrl=null,voiceStream=null,voiceBlob=null;
const voicePreview=$('voicePreview');
const setVoicePreview=blob=>{voiceBlob=blob;updateEditor();if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=URL.createObjectURL(blob);voicePreview.src=voiceUrl;voicePreview.hidden=false;};
$('recordVoice').onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Este navegador não permite gravar áudio.');voiceStream=await navigator.mediaDevices.getUserMedia({audio:true});voiceChunks=[];voiceRecorder=new MediaRecorder(voiceStream);voiceRecorder.ondataavailable=e=>{if(e.data.size)voiceChunks.push(e.data)};voiceRecorder.onstop=()=>{setVoicePreview(new Blob(voiceChunks,{type:voiceRecorder.mimeType||'audio/webm'}));$('voiceStatus').textContent='Narração gravada. Ouça a prévia antes de continuar.';voiceStream?.getTracks().forEach(t=>t.stop());$('recordVoice').disabled=false;$('stopVoice').disabled=true};voiceRecorder.start();$('recordVoice').disabled=true;$('stopVoice').disabled=false;$('voiceStatus').textContent='Gravando sua voz…';}catch(e){$('voiceStatus').textContent='Microfone indisponível: '+e.message;}};
$('stopVoice').onclick=()=>{if(voiceRecorder?.state==='recording')voiceRecorder.stop()};
$('voiceFile').onchange=()=>{const f=$('voiceFile').files[0];if(!f)return;setVoicePreview(f);$('voiceStatus').textContent='Narração importada: '+f.name};
const editorFields=['quality','fps','crf','framing','captions','captionLanguage','captionStyle','ducking','originalVolume','duckDb','releaseMs'];
const updateEditor=()=>{if(localEngine()){$('processingEngine').onchange();return}const captions=$('captions').checked;$('captionLanguage').disabled=!captions;$('captionStyle').disabled=!captions;$('duckDb').disabled=!$('ducking').checked||!voiceBlob;$('releaseMs').disabled=!$('ducking').checked||!voiceBlob;$('settingsSummary').textContent='Configuração desejada: '+$('quality').value+'p · '+$('fps').value+' FPS · '+(captions?'legendas '+$('captionLanguage').value:'sem legendas')+' · '+($('ducking').checked?'ducking ligado':'ducking desligado')+'. Configurações enviadas ao renderizador.'};
editorFields.forEach(id=>$(id).addEventListener('change',updateEditor));updateEditor();

let resultUrls=[];
const clearResults=()=>{for(const url of resultUrls)URL.revokeObjectURL(url);resultUrls=[];$('results').replaceChildren()};
$('watermark').addEventListener('change',()=>{$('brand').disabled=!$('watermark').checked;updateEditor()});$('watermark').dispatchEvent(new Event('change'));
$('count').addEventListener('change',updateEditor);$('clipDuration').addEventListener('change',updateEditor);$('aspect').addEventListener('change',updateEditor);
const oldModeChange=$('mode').onchange;$('mode').onchange=()=>{oldModeChange();$('count').disabled=$('mode').value==='single';$('clipDuration').disabled=$('mode').value==='single';clearResults()};$('mode').onchange();

const updateGenerateState=()=>{$('signout').disabled=localBusy;for(const id of ['file','processingEngine','tabYoutube','tabUpload','mode','count','clipDuration','start','end','trimStart','trimEnd','duration','watermark','brand','useGtaBrand'])$(id).disabled=localBusy;$('brand').disabled=localBusy||!$('watermark').checked;const yt=sourceMode==='youtube';$('manualFields').hidden=yt||$('mode').value!=='single';$('rangeFields').hidden=yt||(!localEngine()&&$('mode').value==='batch');$('endField').hidden=!localEngine();$('trimFields').hidden=!localEngine();const ready=yt?Boolean(youtubeId($('youtubeUrl').value.trim())&&$('rights').checked):Boolean($('file').files[0]||importedYoutubeFile);$('generate').disabled=localBusy||!ready;$('generate').title=ready?'Gerar vídeos com as configurações escolhidas':yt?'Informe um link e confirme os direitos de edição':'Selecione um vídeo';$('generate').textContent=yt?'Gerar clipes':$('mode').value==='batch'?'Gerar clipes':'Cortar seleção manual';$('mode').disabled=localBusy||yt;$('recordVoice').disabled=yt||localBusy||localEngine();$('voiceFile').disabled=yt||localBusy||localEngine();$('count').disabled=localBusy||!yt&&$('mode').value==='single';$('clipDuration').disabled=localBusy||!yt&&$('mode').value==='single';};
$('youtubeUrl').addEventListener('input',updateGenerateState);$('rights').addEventListener('change',updateGenerateState);$('file').addEventListener('change',updateGenerateState);$('mode').addEventListener('change',updateGenerateState);updateGenerateState();


let lastYoutubeCheck=null;
$('checkYoutube').onclick=async()=>{
  const url=$('youtubeUrl').value.trim(),id=youtubeId(url);
  if(!id){$('youtubeCheck').textContent='Cole um link válido antes de verificar.';return}
  const {data:{session}}=await sb.auth.getSession();
  if(!session){$('youtubeCheck').textContent='Faça login para verificar o link.';return}
  const button=$('checkYoutube');button.disabled=true;
  $('youtubeCheck').textContent='Verificando o acesso pelo servidor...';
  try{
    const body=new FormData();body.append('url',url);
    const response=await fetch(api+'/youtube/check',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.detail||'Erro '+response.status);
    lastYoutubeCheck={id,status:data.status};
    const label=data.status==='available'?'✓ Metadados acessíveis':data.status==='blocked'?'⚠ Acesso bloqueado':'? Verificação inconclusiva';
    $('youtubeCheck').textContent=label+' — '+(data.title?data.title+' — ':'')+data.message;
  }catch(error){lastYoutubeCheck=null;$('youtubeCheck').textContent='Falha ao verificar: '+error.message}
  finally{button.disabled=false}
};
$('youtubeUrl').addEventListener('input',()=>{lastYoutubeCheck=null;$('youtubeCheck').textContent='Link alterado. Verifique o acesso pelo servidor antes de gerar.'});


$('downloadYoutubeMp4').onclick=async()=>{
  const url=$('youtubeUrl').value.trim(),id=youtubeId(url);
  if(!id){$('youtubeCheck').textContent='Cole um link válido do YouTube.';return}
  if(!$('rights').checked){$('youtubeCheck').textContent='Confirme sua autorização para editar o vídeo.';return}
  const {data:{session}}=await sb.auth.getSession();
  if(!session){$('youtubeCheck').textContent='Entre na sua conta antes de baixar.';return}
  const btn=$('downloadYoutubeMp4');btn.disabled=true;
  $('youtubeCheck').textContent='Obtendo o vídeo e convertendo para MP4. Mantenha a página aberta...';
  try{
    const form=new FormData();form.append('url',url);form.append('rights_confirmed','true');
    const response=await fetch(api+'/youtube/download',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:form});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.detail||'Erro '+response.status)}
    const blob=await response.blob();
    if(!blob.size)throw Error('O servidor retornou um vídeo vazio.');
    importedYoutubeFile=new File([blob],'youtube_'+id+'.mp4',{type:'video/mp4'});
    try{const dt=new DataTransfer();dt.items.add(importedYoutubeFile);$('file').files=dt.files}catch{}
    setSourceMode('upload');
    if(localPreviewUrl)URL.revokeObjectURL(localPreviewUrl);
    localPreviewUrl=URL.createObjectURL(importedYoutubeFile);
    const video=document.createElement('video');video.src=localPreviewUrl;video.controls=true;video.playsInline=true;
    $('videoPreview').replaceChildren(video);
    $('status').textContent='MP4 importado ('+(blob.size/1048576).toFixed(1)+' MB). Configure os cortes e clique em Gerar clipes.';
    $('youtubeCheck').textContent='MP4 obtido e preparado para edição.';
    updateGenerateState();
  }catch(error){$('youtubeCheck').textContent='Não foi possível obter o MP4: '+error.message}
  finally{btn.disabled=false}
};


$('importDirectMedia').onclick=async()=>{
  const url=$('directMediaUrl').value.trim();
  if(!url.startsWith('https://')){$('directMediaStatus').textContent='Informe um link HTTPS direto para MP4.';return}
  const {data:{session}}=await sb.auth.getSession();
  if(!session){$('directMediaStatus').textContent='Faça login para importar.';return}
  const button=$('importDirectMedia');button.disabled=true;
  $('directMediaStatus').textContent='Importando vídeo autorizado...';
  try{
    const body=new FormData();body.append('url',url);
    const response=await fetch(api+'/media/import',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.detail||'Falha HTTP '+response.status)}
    const blob=await response.blob();
    importedYoutubeFile=new File([blob],'video_importado.mp4',{type:'video/mp4'});
    try{const dt=new DataTransfer();dt.items.add(importedYoutubeFile);$('file').files=dt.files}catch{}
    setSourceMode('upload');
    if(localPreviewUrl)URL.revokeObjectURL(localPreviewUrl);
    localPreviewUrl=URL.createObjectURL(importedYoutubeFile);
    const video=document.createElement('video');video.src=localPreviewUrl;video.controls=true;video.playsInline=true;
    $('videoPreview').replaceChildren(video);
    $('directMediaStatus').textContent='MP4 importado com sucesso.';
    $('status').textContent='Vídeo pronto para configurar e gerar clipes.';
    updateGenerateState();
  }catch(error){$('directMediaStatus').textContent=error.message}
  finally{button.disabled=false}
};


$('clearProjects').onclick=async()=>{
  if(!window.confirm('Excluir permanentemente todos os registros do seu histórico de projetos?'))return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){$('historyStatus').textContent='Faça login novamente.';return}
  const button=$('clearProjects');button.disabled=true;
  try{
    const {data:existing,error:readError}=await sb.from('clip_projects').select('id').eq('user_id',session.user.id);
    if(readError)throw readError;
    if(!existing?.length){$('historyStatus').textContent='Histórico já está vazio.';return}
    const {data:removed,error}=await sb.from('clip_projects').delete().eq('user_id',session.user.id).select('id');
    if(error)throw error;
    if((removed||[]).length!==existing.length)throw Error('O banco não permitiu excluir todos os registros. Verifique a política de exclusão do Supabase.');
    $('historyStatus').textContent='Histórico apagado ('+removed.length+' registros).';
    await loadProjects();
  }catch(error){$('historyStatus').textContent='Falha ao limpar histórico: '+error.message}
  finally{button.disabled=false}
};


setSourceMode('upload');$('processingEngine').onchange();

$('processingEngine').addEventListener('change',updateGenerateState);


manualTimeline=mountTimeline({preview:$('videoPreview'),root:$('manualTimeline'),mode:$('mode'),duration:$('duration'),start:$('start'),end:$('end'),watermark:$('watermark'),brand:$('brand'),engine:$('processingEngine'),generate:$('generate'),trimStart:$('trimStart'),trimEnd:$('trimEnd')});


$('uploadSavedClips').onchange=async()=>{const files=Array.from($('uploadSavedClips').files);if(!files.length)return;const {data:{session}}=await sb.auth.getSession();if(!session){$('savedClipsStatus').textContent='Entre na sua conta para enviar os cortes.';return;}const button=$('uploadSavedClips');button.disabled=true;try{await vault.saveFiles(files.map(blob=>({name:blob.name,blob})),'Corte importado',session.user.id);}finally{button.disabled=false;button.value='';}};

function updateClipGuidance(){
  const note=$('clipGuidance'),video=$('videoPreview').querySelector('video');
  note.hidden=sourceMode!=='upload'||!localEngine();
  if(note.hidden)return;
  if(!video||!Number.isFinite(video.duration)){note.textContent='1. Clique em “Enviar vídeo” e selecione o arquivo.\n2. Aguarde a prévia carregar.\n3. Escolha o modo, a duração e a quantidade; aqui aparecerá o que cabe no seu vídeo.';return;}
  const total=video.duration,ignoredStart=Number($('trimStart').value),ignoredEnd=Number($('trimEnd').value),usable=Math.max(0,total-ignoredStart-ignoredEnd);
  const header='Seu vídeo: '+video.videoWidth+' × '+video.videoHeight+' · '+total.toFixed(1)+'s. Ignorando '+ignoredStart+'s do início e '+ignoredEnd+'s do final, sobram '+usable.toFixed(1)+'s.\n';
  try{
    const options={mode:$('mode').value,count:Number($('count').value),clipDuration:Number($('clipDuration').value),trimStart:ignoredStart,trimEnd:ignoredEnd,start:$('mode').value==='single'?ignoredStart:$('start').value,end:$('end').value,duration:Number($('duration').value),selections:$('mode').value==='single'?manualTimeline?.getSelections():undefined};
    const parts=planSegments(total,options);
    $('resetClipRange').hidden=true;note.classList.remove('needs-correction');note.textContent=header+'Configuração pronta: '+parts.length+' clipe(s) de '+parts[0].length+'s. O primeiro vai de '+parts[0].start.toFixed(1)+'s até '+(parts[0].start+parts[0].length).toFixed(1)+'s.\n'+($('mode').value==='single'?'Arraste a seleção abaixo da prévia e clique em “Cortar trecho”. Use “Adicionar trecho” para escolher vários.':'Confira os valores e clique em “Gerar clipes”.');
  }catch(error){$('resetClipRange').hidden=!error.resetRange;note.classList.add('needs-correction');note.textContent=header+error.message;}
}
let guidanceVideo=null;
function bindClipGuidance(){const video=$('videoPreview').querySelector('video');if(video!==guidanceVideo){guidanceVideo=video;video?.addEventListener('loadedmetadata',updateClipGuidance);video?.addEventListener('cliprangechange',updateClipGuidance);}updateClipGuidance();}
new MutationObserver(bindClipGuidance).observe($('videoPreview'),{childList:true});
for(const id of ['start','end','trimStart','trimEnd','count','duration','clipDuration','mode','processingEngine']){ $(id).addEventListener('input',updateClipGuidance);$(id).addEventListener('change',updateClipGuidance);}
$('manualTimeline').addEventListener('input',()=>queueMicrotask(updateClipGuidance));
$('manualTimeline').addEventListener('click',()=>queueMicrotask(updateClipGuidance));
$('tabUpload').addEventListener('click',updateClipGuidance);$('tabYoutube').addEventListener('click',updateClipGuidance);
$('resetClipRange').onclick=()=>{$('start').value=$('trimStart').value;$('end').value='';$('start').dispatchEvent(new Event('input'));$('end').dispatchEvent(new Event('input'));$('resetClipRange').hidden=true;$('status').textContent='Intervalo corrigido de acordo com os valores em “Ignorar no início” e “Ignorar no final”. Confira a quantidade e a duração no aviso acima e clique em “Gerar clipes” novamente.';updateClipGuidance();};
bindClipGuidance();


watermarkPreference=rememberWatermark({sb,input:$('brand'),preset:$('useGtaBrand'),status:$('brandSavedStatus')});




document.addEventListener('play',event=>{if(localBusy&&event.target.tagName==='VIDEO'&&event.target.dataset.localCapture!=='true'){event.target.pause();$('status').textContent='O corte offline está em andamento na resolução original. Aguarde terminar para assistir aos outros vídeos e evitar disputa de decodificação.';}},true);
