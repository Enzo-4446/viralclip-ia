import {createWalletClient} from './wallet-client.js';
import {formatBRL,FREE_CLIP_LIMIT} from './commercial-pricing.js';
export function mountWalletPanel({sb,root,enabled=false}){
 if(!root)throw new TypeError('Área de carteira não encontrada');
 root.hidden=!enabled;
 if(!enabled)return {refresh:async()=>{},clear:()=>{}};
 const client=createWalletClient(sb);
 const symbol=document.createElement('span');symbol.className='wallet-symbol';symbol.textContent='$';
 const values=document.createElement('div');values.className='wallet-values';
 const label=document.createElement('span');label.className='wallet-label';label.textContent='Saldo disponível';
 const total=document.createElement('strong');total.className='wallet-total';total.textContent='—';
 const detail=document.createElement('span');detail.className='wallet-detail';detail.textContent='Consultando créditos…';
 values.append(label,total,detail);root.replaceChildren(symbol,values);
 root.setAttribute('role','status');root.setAttribute('aria-live','polite');
 let sequence=0;
 async function refresh(){
  const current=++sequence;detail.textContent='Atualizando…';
  try{
   const [wallet,adminCheck]=await Promise.all([client.getBalance(),sb.rpc('viral_admin_is_member')]);
   if(current!==sequence)return;
   if(!adminCheck.error&&adminCheck.data===true){
    symbol.textContent='∞';label.textContent='Conta ADM · Ilimitada';total.textContent='∞';detail.textContent='Créditos ilimitados';return;
   }
   symbol.textContent='$';label.textContent='Saldo disponível';
   total.textContent=formatBRL(wallet.paid_cents+wallet.bonus_cents);
   detail.textContent='Pago '+formatBRL(wallet.paid_cents)+' · Bônus '+formatBRL(wallet.bonus_cents)+' · Grátis '+Math.max(0,FREE_CLIP_LIMIT-wallet.free_exports_used);
  }catch{
   if(current!==sequence)return;
   symbol.textContent='$';label.textContent='Carteira';total.textContent='—';detail.textContent='Saldo indisponível · sem cobrança';
  }
 }
 return {refresh,clear(){sequence++;symbol.textContent='$';label.textContent='Saldo disponível';total.textContent='—';detail.textContent='';}};
}
