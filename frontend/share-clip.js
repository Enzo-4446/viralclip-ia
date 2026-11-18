export function attachClipSharing({button,info,getBlob,name,nav=globalThis.navigator}) {
  let prepared=null;
  const fallback='No iPad, abra o site no Safari. Ou toque em “Baixar vídeo”, abra Arquivos → Downloads, abra o vídeo e toque em Compartilhar → Salvar Vídeo. Depois abra o TikTok e escolha Carregar / Fotos. Se “Salvar Vídeo” não aparecer, o formato pode não ser compatível com Fotos; tente um corte MP4.';
  button.type='button';button.className='button-secondary';button.textContent='1. Preparar para Fotos / TikTok';
  button.onclick=async()=>{
    if(prepared){
      // No await or network request before share: iPad requires a fresh user gesture.
      button.disabled=true;
      try{await nav.share({files:[prepared],title:name});info.textContent='O menu de compartilhamento foi fechado. Se você escolheu “Salvar Vídeo”, confira o arquivo no app Fotos antes de apagá-lo da conta. Para postar, abra o TikTok e escolha Carregar / Fotos.';}
      catch(error){info.textContent=error?.name==='AbortError'?'Compartilhamento cancelado. O corte continua salvo na conta; toque no botão novamente quando quiser.':fallback;}
      finally{button.disabled=false;}
      return;
    }
    if(!nav?.share||!nav?.canShare){info.textContent=fallback;return;}
    button.disabled=true;info.textContent='Carregando o arquivo de vídeo para compartilhar. Aguarde sem fechar a página...';
    try{
      const blob=await getBlob();
      const type=name.toLowerCase().endsWith('.webm')?'video/webm':'video/mp4';
      const file=new File([blob],name,{type});
      if(!nav.canShare({files:[file]})){info.textContent=fallback;return;}
      prepared=file;button.textContent='2. Compartilhar / salvar em Fotos';
      info.textContent='Vídeo preparado. Toque no botão acima e, no menu do iPad, escolha “Salvar Vídeo” para enviar à galeria. Depois, no TikTok, toque em + → Carregar e selecione o vídeo. Você também pode escolher o TikTok no menu, se ele aparecer.';
    }catch(error){info.textContent='Não consegui preparar o vídeo: '+error.message+'. Tente novamente. O corte continua salvo na sua conta.';}
    finally{button.disabled=false;}
  };
}
