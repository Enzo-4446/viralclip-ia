import {createWalletClient} from './wallet-client.js';
import {formatBRL,FREE_CLIP_LIMIT} from './commercial-pricing.js';
/** Read-only wallet view. No purchase controls until payment and server verification are ready. */
export function mountWalletPanel({sb,root,enabled=false}){
 if(!root)throw new TypeError('Área de carteira não encontrada');
 root.hidden=!enabled;
 if(!enabled)return {refresh:async()=>{},clear:()=>{}};
 const client=createWalletClient(sb);
 const text=document.createElement('p');
 text.setAttribute('role','status');text.setAttribute('aria-live','polite');
 root.append(text);
 let sequence=0;
 async function refresh(){
  const current=++sequence;
  text.textContent='Consultando créditos…';
  try{
   const [wallet,adminCheck]=await Promise.all([client.getBalance(),sb.rpc('viral_admin_is_member')]);
   if(current!==sequence)return;
   if(!adminCheck.error&&adminCheck.data===true){text.textContent='∞ · Créditos ilimitados · Conta Administrador (ADM)';return;}
   text.textContent='Saldo: '+formatBRL(wallet.paid_cents)+' · Bônus: '+formatBRL(wallet.bonus_cents)+' · Cortes gratuitos restantes: '+Math.max(0,FREE_CLIP_LIMIT-wallet.free_exports_used);
  }catch(error){
   if(current!==sequence)return;
   text.textContent='Carteira indisponível neste momento. Nenhum crédito será cobrado.';
  }
 }
 return {refresh,clear:()=>{sequence++;text.textContent='';}};
}
