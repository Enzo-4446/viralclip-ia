import {priceExport,freeExportEligible} from './commercial-pricing.js';
export function createWalletClient(sb){
 if(!sb?.rpc||!sb?.from)throw new TypeError('Conexão de carteira indisponível.');
 return {
  async getBalance(){
   const {data:{user},error:authError}=await sb.auth.getUser();
   if(authError||!user)throw Error('Entre na sua conta para consultar os créditos.');
   const {data,error}=await sb.from('viral_wallets').select('paid_cents,bonus_cents,free_exports_used').eq('user_id',user.id).maybeSingle();
   if(error)throw error;
   return data||{paid_cents:0,bonus_cents:0,free_exports_used:0};
  },
  async reserve(){throw new Error('Cobrança bloqueada até a confirmação segura de exportação pelo servidor.');},
  async finish(){throw new Error('Liquidação e estornos são exclusivos do servidor.');},
  quote(segments,used){return {cents:priceExport(segments),free:freeExportEligible(segments,used)};}
 };
}
