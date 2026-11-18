import {PACKAGES,packageForCents} from './commercial-pricing.js';
export function changeQuantity(cart,priceCents,delta){
 if(!packageForCents(priceCents)||!Number.isInteger(delta)||Math.abs(delta)!==1)throw Error('Pacote ou alteração inválida.');
 const current=cart[priceCents]||0;
 if(!Number.isSafeInteger(current)||current<0||current>20)throw Error('Quantidade inválida.');
 const next=Math.max(0,current+delta);
 if(next>20)throw Error('Máximo de 20 unidades por pacote.');
 const copy={...cart};if(next)copy[priceCents]=next;else delete copy[priceCents];
 if(cartTotals(copy).quantity>30)throw Error('Máximo de 30 itens por pedido.');
 return copy;
}
export function cartTotals(cart){
 if(!cart||typeof cart!=='object'||Array.isArray(cart))throw Error('Carrinho inválido.');
 let quantity=0,totalCents=0,paidCents=0,bonusCents=0;
 for(const [key,count] of Object.entries(cart)){
  const price=Number(key),pack=packageForCents(price);
  if(!pack||!Number.isSafeInteger(count)||count<0||count>20)throw Error('Item de carrinho inválido.');
  quantity+=count;totalCents+=pack.priceCents*count;paidCents+=pack.priceCents*count;bonusCents+=pack.bonusCents*count;
 }
 if(quantity>30)throw Error('Carrinho excede o limite de itens.');
 return {quantity,totalCents,paidCents,bonusCents};
}
export function buildDraftOrder(cart,id){
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Identificação de pedido inválida.');
 const totals=cartTotals(cart);if(!totals.quantity)throw Error('Adicione um pacote ao carrinho.');
 return Object.freeze({id,...totals,items:PACKAGES.filter(p=>cart[p.priceCents]>0).map(p=>({priceCents:p.priceCents,quantity:cart[p.priceCents]})),status:'demo_unpaid'});
}
