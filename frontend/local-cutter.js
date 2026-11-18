import {zipSync} from 'fflate';

export function planSegments(total,{mode,count,clipDuration,start,end,duration,selections,trimStart=10,trimEnd=10}) {
  if(!Number.isFinite(total))throw Error('Não consegui ler a duração do vídeo. Em “Enviar vídeo”, selecione o arquivo novamente e aguarde a prévia carregar. Se a prévia não abrir, tente outro arquivo MP4.');
  const ignoredStart=Number(trimStart),ignoredEnd=Number(trimEnd);
  if(!Number.isFinite(ignoredStart)||!Number.isFinite(ignoredEnd)||ignoredStart<0||ignoredEnd<0)throw Error('Em “Ignorar no início” e “Ignorar no final”, digite uma quantidade de segundos igual ou maior que 0. Use 0 para não ignorar nada.');
  if(total<=ignoredStart+ignoredEnd)throw Error('Seu vídeo tem '+total.toFixed(1)+'s, mas você escolheu ignorar '+ignoredStart+'s do início e '+ignoredEnd+'s do final. Reduza esses dois valores; use 0 e 0 para aproveitar o vídeo completo.');
  if(!['single','batch'].includes(mode))throw Error('Modo de corte inválido.');
  const first=Math.max(ignoredStart,start==null||start===''?ignoredStart:Number(start));
  const last=Math.min(total-ignoredEnd,end==null||end===''?total-ignoredEnd:Number(end));
  if(!Number.isFinite(first)||!Number.isFinite(last)||first>=last){
    const error=Error('O início e o final escolhidos não formam um intervalo para cortar.\nSeu vídeo tem '+total.toFixed(1)+' segundos. Depois de ignorar '+ignoredStart+'s do início e '+ignoredEnd+'s do final, você pode usar de '+ignoredStart+' até '+(total-ignoredEnd).toFixed(1)+' segundos.\nValores preenchidos: “Começar em” = '+(start==null||start===''?'vazio':String(start))+'; “Terminar em” = '+(end==null||end===''?'vazio (automático)':String(end))+'.\nComo corrigir:\n1. Em “Começar em (segundos)”, digite '+ignoredStart+'.\n2. Em “Terminar em (segundos, opcional)”, apague o valor e deixe vazio.\n3. Confira a quantidade e a duração dos clipes e clique em “Gerar clipes” novamente.\nVocê também pode clicar em “Usar intervalo completo permitido” abaixo.');
    error.resetRange=true;throw error;
  }
  const length=Number(mode==='single'?duration:clipDuration);
  if(!Number.isFinite(length)||length<=0)throw Error('A duração está vazia ou inválida. No modo automático, escolha de 30 segundos até 2 minutos em “Duração de cada clipe automático”. No modo manual, escolha em “Duração fixa do corte”, abaixo da prévia.');
  if(mode==='single'&&selections?.length) {
    if(selections.length>10)throw Error('Selecione no máximo 10 trechos por vez.');
    return selections.map((item,index)=>{
      const offset=Number(item.start);
      if(!Number.isFinite(offset)||offset<first||offset+length>last+1e-6)throw Error('O trecho '+(index+1)+' começa em '+String(item.start)+'s e precisa de '+length+'s, mas ele deve ficar entre '+first.toFixed(1)+'s e '+last.toFixed(1)+'s.\nComo corrigir: '+(last-first>=length?'na seleção abaixo da prévia, arraste o início para um ponto entre '+first.toFixed(1)+'s e '+(last-length).toFixed(1)+'s.':'escolha uma duração menor; este intervalo tem somente '+(last-first).toFixed(1)+'s úteis.')+' Se o trecho já estiver na lista, clique em “Remover” nele e adicione a seleção corrigida.');
      return {start:offset,length};
    });
  }
  const limit=mode==='single'?1:Number(count);
  if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('Escolha de 1 a 10 clipes.');
  if(limit*length>last-first+1e-6){
    const available=last-first,capacity=Math.floor(available/length);
    const alternatives=[30,45,60,90,105,120].filter(seconds=>limit*seconds<=available+1e-6);
    throw Error('Você pediu '+limit+' clipe(s) de '+length+'s: são necessários '+(limit*length)+'s.\nO intervalo escolhido vai de '+first.toFixed(1)+'s até '+last.toFixed(1)+'s, tem '+available.toFixed(1)+'s úteis e comporta '+capacity+' clipe(s) de '+length+'s.\nComo corrigir:\n'+(capacity>0?'• Em “Quantidade de clipes”, escolha '+capacity+' ou menos, mantendo '+length+' segundos.':'• Este intervalo não comporta nem 1 clipe de '+length+'s. Escolha uma duração menor ou um vídeo mais longo.')+'\n'+(alternatives.length?'• Para manter '+limit+' clipe(s), em “Duração de cada clipe automático”, escolha '+alternatives.join(' ou ')+' segundos.':'• Para manter essa quantidade e duração, selecione um vídeo maior ou amplie o intervalo usando “Começar em” = '+ignoredStart+' e “Terminar em” vazio. Você também pode reduzir “Ignorar no início” e “Ignorar no final”.')+'\nA duração dos cortes não será encurtada automaticamente.');
  }
  return Array.from({length:limit},(_,i)=>({start:first+i*length,length}));
}
let busy=false;
export async function cutLocally(file,options,status=()=>{},signal=new AbortController().signal){
  if(busy)throw Error('Já existe um corte em andamento. Aguarde terminar ou cancele.');
  if(!file?.size)throw Error('Selecione um arquivo de vídeo que não esteja vazio.');
  if(options.watermark&&!options.brand?.trim())throw Error('Informe o nome da marca d’água.');
  if(typeof globalThis.VideoDecoder!=='function'||typeof globalThis.VideoEncoder!=='function')throw Error('Este navegador não oferece o processamento quadro a quadro necessário. Abra o site no Chrome ou Edge atualizado no computador. O corte não usará a gravação em tempo real que estava perdendo quadros.');
  busy=true;let source;
  try{
    if(signal.aborted)throw new DOMException('Corte cancelado.','AbortError');
    status('Abrindo o arquivo para corte offline, sem gravar a reprodução da tela...');
    const {openOfflineInput,renderOfflineClip}=await import('./offline-cutter.js');
    source=await openOfflineInput(file);
    const segments=planSegments(source.duration,options),files=[];
    if(options.watermark)await document.fonts.load('650 16px "Manrope Variable"');
    for(let index=0;index<segments.length;index++){
      if(signal.aborted)throw new DOMException('Corte cancelado.','AbortError');
      const report=message=>status('Clipe '+(index+1)+' de '+segments.length+' · '+message);
      const result=await renderOfflineClip(source,file,segments[index],options,report,signal);
      files.push({name:'viralclip_'+String(index+1).padStart(2,'0')+'.mp4',blob:result.blob,type:'video/mp4',verification:result.verification});
    }
    const notice='Corte offline MP4: resolução e sequência de quadros verificadas.';
    if(files.length===1)return {blob:files[0].blob,files,zip:false,extension:'mp4',notice};
    if(files.reduce((sum,item)=>sum+item.blob.size,0)>64*1024*1024)return {blob:null,files,zip:false,extension:'mp4',notice:notice+' Baixe os cortes individualmente para evitar sobrecarga de memória.'};
    status('Montando ZIP local...');const entries={};for(const item of files)entries[item.name]=new Uint8Array(await item.blob.arrayBuffer());
    return {blob:new Blob([zipSync(entries,{level:0})],{type:'application/zip'}),files,zip:true,extension:'mp4',notice};
  }finally{source?.dispose();busy=false;}
}
