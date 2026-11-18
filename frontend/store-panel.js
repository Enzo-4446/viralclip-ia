import {PACKAGES,formatBRL,FREE_CLIP_LIMIT,CENTS_PER_30_SECONDS} from './commercial-pricing.js';
const el=(tag,className,text)=>{const x=document.createElement(tag);if(className)x.className=className;if(text!==undefined)x.textContent=text;return x;};
export function mountStore({root,openButton,closeButton}){
 if(!root||!openButton||!closeButton)throw new TypeError('Loja não encontrada');
 const grid=root.querySelector('#storePackages'),summary=root.querySelector('#storeSummary'),status=root.querySelector('#storeStatus');
 if(!grid||!summary||!status)throw new TypeError('Estrutura da loja incompleta');
 let selected=null;
 const cards=[];
 PACKAGES.forEach((pack,index)=>{
  const card=el('button','store-package');
  card.type='button';card.setAttribute('aria-pressed','false');
  if(pack.bonusCents){card.classList.add('store-featured');card.append(el('span','store-badge','MAIS VANTAJOSO'));}
  card.append(el('span','store-package-caption',index===0?'Comece agora':pack.bonusCents?'Pacote especial':'Créditos flexíveis'));
  card.append(el('strong','store-package-price',formatBRL(pack.priceCents)));
  card.append(el('span','store-package-detail',pack.bonusCents?'+'+formatBRL(pack.bonusCents)+' de bônus':'Crédito integral para cortes'));
  const action=el('span','store-package-action','Selecionar pacote');card.append(action);
  card.onclick=()=>{
   selected=pack;cards.forEach(x=>{const active=x===card;x.classList.toggle('store-selected',active);x.setAttribute('aria-pressed',String(active));});
   summary.textContent='Pacote selecionado: '+formatBRL(pack.priceCents)+(pack.bonusCents?' + '+formatBRL(pack.bonusCents)+' de bônus':'')+'.';
   status.textContent='Pagamento indisponível nesta fase de testes. Nenhum valor foi cobrado.';
  };
  cards.push(card);grid.append(card);
 });
 function close(){root.hidden=true;document.body.classList.remove('store-is-open');openButton.focus();}
 function open(){root.hidden=false;document.body.classList.add('store-is-open');closeButton.focus();}
 openButton.onclick=open;closeButton.onclick=close;
 root.addEventListener('click',e=>{if(e.target===root)close();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 const info=root.querySelector('#storePricingInfo');
 if(info)info.textContent='5 cortes gratuitos de até 60 segundos · '+formatBRL(CENTS_PER_30_SECONDS)+' por bloco de 30 segundos após a franquia · Cobranças ainda não ativadas.';
 return {open,close,clear(){root.hidden=true;document.body.classList.remove('store-is-open');selected=null;cards.forEach(x=>{x.classList.remove('store-selected');x.setAttribute('aria-pressed','false');});summary.textContent='Selecione um pacote para visualizar os detalhes.';status.textContent='';}};
}
