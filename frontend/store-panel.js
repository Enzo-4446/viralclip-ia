import {PACKAGES,formatBRL,CENTS_PER_30_SECONDS} from './commercial-pricing.js';
import {cartTotals,changeQuantity,buildDraftOrder} from './store-cart.js';
const el=(tag,className,text)=>{const x=document.createElement(tag);if(className)x.className=className;if(text!==undefined)x.textContent=text;return x;};
export function mountStore({root,openButton,closeButton}){
 if(!root||!openButton||!closeButton)throw new TypeError('Loja não encontrada');
 const grid=root.querySelector('#storePackages'),summary=root.querySelector('#storeSummary'),status=root.querySelector('#storeStatus');
 const items=root.querySelector('#storeCartItems'),count=root.querySelector('#storeCartCount'),total=root.querySelector('#storeCartTotal');
 const checkout=root.querySelector('#storeCheckout'),order=root.querySelector('#storeOrder'),qr=root.querySelector('#storeQr');
 const details=root.querySelector('#storeOrderDetails'),copy=root.querySelector('#storeCopy');
 if([grid,summary,status,items,count,total,checkout,order,qr,details,copy].some(x=>!x))throw new TypeError('Estrutura da loja incompleta');
 let cart={},draft=null;
 const drawer=root.querySelector('#storeCartDrawer'),cartOpen=root.querySelector('#storeCartOpen'),cartClose=root.querySelector('#storeCartClose'),cartBackdrop=root.querySelector('#storeCartBackdrop'),bubble=root.querySelector('#storeCartBubble');
 if([drawer,cartOpen,cartClose,cartBackdrop,bubble].some(x=>!x))throw new TypeError('Carrinho indisponível');
 function showCart(){drawer.hidden=false;cartOpen.setAttribute('aria-expanded','true');cartClose.focus();}
 function hideCart(){drawer.hidden=true;cartOpen.setAttribute('aria-expanded','false');cartOpen.focus();}
 cartOpen.onclick=showCart;cartClose.onclick=hideCart;cartBackdrop.onclick=hideCart;
 function invalidateDraft(){draft=null;order.hidden=true;qr.replaceChildren();details.textContent='';}
 function renderCart(){
  items.replaceChildren();const totals=cartTotals(cart);
  count.textContent=totals.quantity+' '+(totals.quantity===1?'item':'itens');bubble.textContent=String(totals.quantity);total.textContent=formatBRL(totals.totalCents);
  checkout.disabled=totals.quantity===0;
  if(!totals.quantity)items.append(el('p','muted','Seu carrinho está vazio. Escolha um pacote para começar.'));
  PACKAGES.forEach(pack=>{
   const quantity=cart[pack.priceCents]||0;if(!quantity)return;
   const line=el('div','store-cart-line'),description=el('div'),controls=el('div','store-qty');
   description.append(el('strong','',formatBRL(pack.priceCents)+' × '+quantity),el('small','',pack.bonusCents?'Bônus por unidade: '+formatBRL(pack.bonusCents):'Créditos pagos'));
   const minus=el('button','','−'),plus=el('button','','+');minus.type=plus.type='button';
   minus.setAttribute('aria-label','Remover uma unidade');plus.setAttribute('aria-label','Adicionar uma unidade');
   minus.onclick=()=>update(pack.priceCents,-1);plus.onclick=()=>update(pack.priceCents,1);
   controls.append(minus,el('span','',String(quantity)),plus);line.append(description,controls);items.append(line);
  });
  summary.textContent=totals.quantity?'Total '+formatBRL(totals.totalCents)+' · Créditos '+formatBRL(totals.paidCents)+' · Bônus '+formatBRL(totals.bonusCents):'Selecione um pacote para visualizar os detalhes.';
 }
 function update(price,delta){
  try{cart=changeQuantity(cart,price,delta);invalidateDraft();renderCart();if(delta>0)showCart();status.textContent='Carrinho atualizado. Nenhum pagamento realizado.';}
  catch(e){status.textContent=e.message;}
 }
 PACKAGES.forEach((pack,index)=>{
  const card=el('button','store-package');card.type='button';
  if(pack.bonusCents){card.classList.add('store-featured');card.append(el('span','store-badge','MAIS VANTAJOSO'));}
  card.append(el('span','store-package-caption',index===0?'Comece agora':pack.bonusCents?'Pacote especial':'Créditos flexíveis'));
  card.append(el('strong','store-package-price',formatBRL(pack.priceCents)));
  card.append(el('span','store-package-detail',pack.bonusCents?'+'+formatBRL(pack.bonusCents)+' de bônus':'Crédito integral para cortes'));
  card.append(el('span','store-package-action','Adicionar ao carrinho'));
  card.onclick=()=>update(pack.priceCents,1);grid.append(card);
 });
 checkout.onclick=()=>{
  try{
   draft=buildDraftOrder(cart,crypto.randomUUID());
   const payload='VIRAL-IA-DEMO:'+draft.id+':'+draft.totalCents;
   // The QR is explicitly a nonpayable draft identifier, NOT a Pix payload.
   const img=el('img');img.alt='QR demonstrativo do pedido, sem função de pagamento';img.width=220;img.height=220;
   img.referrerPolicy='no-referrer';img.src='https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data='+encodeURIComponent(payload);
   img.onerror=()=>{qr.textContent='Não foi possível carregar o QR demonstrativo. Utilize o identificador abaixo.';};
   qr.replaceChildren(img);
   details.textContent='Pedido '+draft.id+' · Total '+formatBRL(draft.totalCents)+' · Não pago';
   order.hidden=false;status.textContent='Pedido de demonstração criado localmente. Nenhum crédito foi concedido.';
  }catch(e){status.textContent=e.message;}
 };
 copy.onclick=()=>{if(!draft)return;void navigator.clipboard.writeText(draft.id).then(()=>{status.textContent='Identificação copiada.'}).catch(()=>{status.textContent='Não foi possível copiar automaticamente.';});};
 function close(){drawer.hidden=true;cartOpen.setAttribute('aria-expanded','false');root.hidden=true;document.body.classList.remove('store-is-open');openButton.focus();}
 function open(){root.hidden=false;document.body.classList.add('store-is-open');closeButton.focus();}
 openButton.onclick=open;closeButton.onclick=close;
 root.addEventListener('click',e=>{if(e.target===root)close();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!drawer.hidden)hideCart();else close();}});
 const info=root.querySelector('#storePricingInfo');
 if(info)info.textContent='5 cortes gratuitos de até 60 segundos · '+formatBRL(CENTS_PER_30_SECONDS)+' por bloco de 30 segundos após a franquia · Cobranças ainda não ativadas.';
 renderCart();
 return {open,close,clear(){root.hidden=true;drawer.hidden=true;cartOpen.setAttribute('aria-expanded','false');document.body.classList.remove('store-is-open');cart={};invalidateDraft();renderCart();status.textContent='';}};
}
