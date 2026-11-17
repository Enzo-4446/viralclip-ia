import {unzipSync} from 'fflate';
import {createClient} from '@supabase/supabase-js';
const env=import.meta.env;
const sb=createClient(env.VITE_SUPABASE_URL||'https://zltpldhnaqiqkoqdiugp.supabase.co',env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_rfDyhC0aRYFk4QEnm3py1A_se2B2pJi');
const api=(env.VITE_API_URL||'https://viralclip-ia.onrender.com').replace(/\/$/,'');
const authRedirectUrl='https://enzo-4446.github.io/viralclip-ia/';
const $=id=>document.getElementById(id);
window.addEventListener('error',e=>{const s=$('authStatus');if(s)s.textContent='Erro de inicialização: '+e.message});
window.addEventListener('unhandledrejection',e=>{const s=$('authStatus');if(s)s.textContent='Falha de conexão: '+(e.reason?.message||String(e.reason))});
async function refresh(){const {data:{session}}=await sb.auth.getSession();$('auth').hidden=!!session;$('app').hidden=!session;if(session)await loadProjects();}
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
let sourceMode='youtube';let localPreviewUrl=null;let importedYoutubeFile=null;
const setSourceMode=mode=>{sourceMode=mode;$('youtubePanel').hidden=mode!=='youtube';$('uploadPanel').hidden=mode!=='upload';$('tabYoutube').classList.toggle('active',mode==='youtube');$('tabUpload').classList.toggle('active',mode==='upload');$('status').textContent='';$('download').hidden=true;updateGenerateState()};
$('tabYoutube').onclick=()=>setSourceMode('youtube');$('tabUpload').onclick=()=>setSourceMode('upload');
const youtubeId=url=>{try{const u=new URL(url);const h=u.hostname.toLowerCase();if(h==='youtu.be'||h==='www.youtu.be')return u.pathname.split('/')[1]?.match(/^[a-zA-Z0-9_-]{11}$/)?.[0]||null;if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(h)){const id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/)?.[1];return id&&/^[a-zA-Z0-9_-]{11}$/.test(id)?id:null}}catch{}return null};
$('inspectYoutube').onclick=()=>{const id=youtubeId($('youtubeUrl').value.trim());if(!id){$('youtubeInfo').textContent='Link inválido. Cole uma URL de vídeo, Shorts ou live do YouTube.';return}if(localPreviewUrl){URL.revokeObjectURL(localPreviewUrl);localPreviewUrl=null}const iframe=document.createElement('iframe');iframe.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id);iframe.title='Prévia do YouTube';iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';iframe.allowFullscreen=true;iframe.style.cssText='width:100%;height:100%;border:0';$('videoPreview').replaceChildren(iframe);$('youtubeInfo').textContent='Vídeo identificado: '+id+'. Prévia disponível quando o YouTube permitir incorporação. Para gerar, confirme os direitos de edição e escolha suas configurações. A disponibilidade depende das restrições do YouTube.'};
$('file').onchange=()=>{importedYoutubeFile=null;const file=$('file').files[0];if(localPreviewUrl)URL.revokeObjectURL(localPreviewUrl);if(!file)return;localPreviewUrl=URL.createObjectURL(file);const video=document.createElement('video');video.src=localPreviewUrl;video.controls=true;video.playsInline=true;$('videoPreview').replaceChildren(video);$('status').textContent='Arquivo selecionado: '+file.name};
$('generate').onclick=async()=>{const f=$('file').files[0]||importedYoutubeFile;if(sourceMode==='upload'&&!f){$('status').textContent='Selecione um vídeo.';return}if(sourceMode==='youtube'&&!youtubeId($('youtubeUrl').value.trim())){$('status').textContent='Cole um link válido do YouTube.';return}if(sourceMode==='youtube'&&!$('rights').checked){$('status').textContent='Confirme que você tem autorização para editar o vídeo.';return}const {data:{session}}=await sb.auth.getSession();if(!session){$('status').textContent='Faça login novamente.';return}const brand=$('brand').value.trim(),title=$('title').value.trim();if(!api){$('status').textContent='Servidor FFmpeg indisponível.';return}if(!title||($('watermark').checked&&!brand)){$('status').textContent='Informe título e, se ativada, a marca.';return}if($('captions').checked){try{const capsResponse=await fetch(api+'/capabilities',{headers:{Authorization:'Bearer '+session.access_token}});if(capsResponse.ok){const caps=await capsResponse.json();if(!caps.captions){$('status').textContent='O servidor não possui transcrição configurada. Desative Legendas automáticas para gerar o vídeo.';return}}}catch(e){console.warn('Capacidades indisponíveis',e)}}if(sourceMode==='youtube'){
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
const fd=new FormData();if(sourceMode==='youtube'){fd.append('url',$('youtubeUrl').value.trim());fd.append('rights_confirmed','true')}else fd.append('file',f);fd.append('brand',$('watermark').checked?brand:'VIRALCLIP');if(sourceMode!=='youtube'&&$('mode').value==='single'){fd.append('start',$('start').value);fd.append('duration',$('duration').value);}fd.append('settings',JSON.stringify({...Object.fromEntries(editorFields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).type==='number'||['quality','fps','crf'].includes(id)?Number($(id).value):$(id).value])),watermark:$('watermark').checked,aspect:$('aspect').value,count:Number($('count').value),clipDuration:Number($('clipDuration').value)}));if(voiceBlob&&sourceMode==='upload')fd.append('voice',voiceBlob,voiceBlob.name||'narration.webm');$('generate').disabled=true;$('status').textContent='Conectando ao servidor de processamento. A primeira inicialização pode levar cerca de um minuto; mantenha a página aberta.';try{const controller=new AbortController();const timeoutMs=sourceMode==='youtube'||$('mode').value==='batch'?540000:180000;const timeout=setTimeout(()=>controller.abort(),timeoutMs);let r;try{r=await fetch(api+(sourceMode==='youtube'?'/clips/youtube':$('mode').value==='batch'?'/clips/batch':'/clips'),{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:fd,signal:controller.signal})}finally{clearTimeout(timeout)}if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.detail||'Erro '+r.status)}const blob=await r.blob();clearResults();if(sourceMode==='youtube'||$('mode').value==='batch'){try{const entries=unzipSync(new Uint8Array(await blob.arrayBuffer()));const clips=Object.keys(entries).filter(name=>name.endsWith('.mp4')).sort();for(const [index,name] of clips.entries()){const videoBlob=new Blob([entries[name]],{type:'video/mp4'});const url=URL.createObjectURL(videoBlob);resultUrls.push(url);const card=document.createElement('div');card.className='result-card';const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='metadata';const title=document.createElement('p');title.textContent='Clipe '+String(index+1).padStart(2,'0');const link=document.createElement('a');link.href=url;link.download=name;link.textContent='Baixar MP4';card.append(video,title,link);$('results').append(card)}if(clips.length===0)throw Error('ZIP sem vídeos');$('status').textContent=clips.length+' clipes prontos. Baixe individualmente ou todos em ZIP.'}catch(e){$('status').textContent='ZIP gerado, mas não foi possível abrir as prévias: '+e.message}}$('download').href=URL.createObjectURL(blob);$('download').download=(sourceMode==='youtube'||$('mode').value==='batch')?'viralclip_cortes.zip':'viralclip.mp4';$('download').textContent=(sourceMode==='youtube'||$('mode').value==='batch')?'Baixar cortes em ZIP':'Baixar MP4';$('download').hidden=false;if(sourceMode!=='youtube'&&$('mode').value==='single'){$('status').textContent='Clipe pronto para baixar.';const url=$('download').href;const card=document.createElement('div');card.className='result-card';const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;card.append(video);$('results').append(card)}const {error:historyError}=await sb.from('clip_projects').insert({user_id:session.user.id,title,watermark_text:brand,rights_confirmed:true,source_kind:sourceMode==='youtube'?'youtube':'upload'});if(historyError)console.warn('Histórico não salvo:',historyError.message);await loadProjects()}catch(e){$('status').textContent=e?.name==='AbortError'?'O processamento ultrapassou o tempo limite. Tente 1 corte em 720p, 30 FPS, sem legendas. Nenhum histórico foi salvo.':e instanceof TypeError?'Não foi possível conectar ao Render. Verifique se o serviço está ativo e se a origem do site está autorizada (CORS).':e.message}finally{updateGenerateState()}};
sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;$('auth').hidden=false;$('app').hidden=true;$('resetBox').hidden=false;$('authStatus').textContent='Informe uma nova senha para concluir a recuperação.';return}if(!recoveryMode)setTimeout(refresh,0)});refresh();

$('mode').onchange=()=>{$('generate').textContent=$('mode').value==='batch'?'Gerar clipes':'Gerar MP4';$('start').disabled=$('mode').value==='batch';$('duration').disabled=$('mode').value==='batch';$('download').hidden=true};$('mode').onchange();


// Professional editor: safe local recording and explicit render capability notices.
let voiceRecorder=null,voiceChunks=[],voiceUrl=null,voiceStream=null,voiceBlob=null;
const voicePreview=$('voicePreview');
const setVoicePreview=blob=>{voiceBlob=blob;updateEditor();if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=URL.createObjectURL(blob);voicePreview.src=voiceUrl;voicePreview.hidden=false;};
$('recordVoice').onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Este navegador não permite gravar áudio.');voiceStream=await navigator.mediaDevices.getUserMedia({audio:true});voiceChunks=[];voiceRecorder=new MediaRecorder(voiceStream);voiceRecorder.ondataavailable=e=>{if(e.data.size)voiceChunks.push(e.data)};voiceRecorder.onstop=()=>{setVoicePreview(new Blob(voiceChunks,{type:voiceRecorder.mimeType||'audio/webm'}));$('voiceStatus').textContent='Narração gravada. Ouça a prévia antes de continuar.';voiceStream?.getTracks().forEach(t=>t.stop());$('recordVoice').disabled=false;$('stopVoice').disabled=true};voiceRecorder.start();$('recordVoice').disabled=true;$('stopVoice').disabled=false;$('voiceStatus').textContent='Gravando sua voz…';}catch(e){$('voiceStatus').textContent='Microfone indisponível: '+e.message;}};
$('stopVoice').onclick=()=>{if(voiceRecorder?.state==='recording')voiceRecorder.stop()};
$('voiceFile').onchange=()=>{const f=$('voiceFile').files[0];if(!f)return;setVoicePreview(f);$('voiceStatus').textContent='Narração importada: '+f.name};
const editorFields=['quality','fps','crf','framing','captions','captionLanguage','captionStyle','ducking','originalVolume','duckDb','releaseMs'];
const updateEditor=()=>{const captions=$('captions').checked;$('captionLanguage').disabled=!captions;$('captionStyle').disabled=!captions;$('duckDb').disabled=!$('ducking').checked||!voiceBlob;$('releaseMs').disabled=!$('ducking').checked||!voiceBlob;$('settingsSummary').textContent='Configuração desejada: '+$('quality').value+'p · '+$('fps').value+' FPS · '+(captions?'legendas '+$('captionLanguage').value:'sem legendas')+' · '+($('ducking').checked?'ducking ligado':'ducking desligado')+'. Configurações enviadas ao renderizador.'};
editorFields.forEach(id=>$(id).addEventListener('change',updateEditor));updateEditor();

let resultUrls=[];
const clearResults=()=>{for(const url of resultUrls)URL.revokeObjectURL(url);resultUrls=[];$('results').replaceChildren()};
$('watermark').addEventListener('change',()=>{$('brand').disabled=!$('watermark').checked;updateEditor()});$('watermark').dispatchEvent(new Event('change'));
$('count').addEventListener('change',updateEditor);$('clipDuration').addEventListener('change',updateEditor);$('aspect').addEventListener('change',updateEditor);
const oldModeChange=$('mode').onchange;$('mode').onchange=()=>{oldModeChange();$('count').disabled=$('mode').value==='single';$('clipDuration').disabled=$('mode').value==='single';clearResults()};$('mode').onchange();

const updateGenerateState=()=>{const yt=sourceMode==='youtube';$('manualFields').hidden=yt||$('mode').value!=='single';const ready=yt?Boolean(youtubeId($('youtubeUrl').value.trim())&&$('rights').checked):Boolean($('file').files[0]||importedYoutubeFile);$('generate').disabled=!ready;$('generate').title=ready?'Gerar vídeos com as configurações escolhidas':yt?'Informe um link e confirme os direitos de edição':'Selecione um vídeo';$('generate').textContent=yt?'Gerar clipes':$('mode').value==='batch'?'Gerar clipes':'Gerar MP4';$('mode').disabled=yt;$('recordVoice').disabled=yt;$('voiceFile').disabled=yt;$('count').disabled=!yt&&$('mode').value==='single';$('clipDuration').disabled=!yt&&$('mode').value==='single';};
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
