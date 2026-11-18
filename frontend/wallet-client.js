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
  async reserve(segments,key=crypto.randomUUID()){
   if(!Array.isArray(segments)||!segments.length)throw Error('Selecione pelo menos um clipe.');
   const payload=segments.map(({length})=>({length}));
   priceExport(payload); // early validation; database remains source of truth
   const {data,error}=await sb.rpc('viral_reserve_export',{p_request_key:key,p_segments:payload});
   if(error)throw error;
   return data;
  },
  async finish(id,success){
   if(!id||success!==true)throw new TypeError('Estornos exigem confirmação segura pelo servidor.');
   const {data,error}=await sb.rpc('viral_finish_export',{p_reservation_id:id,p_success:success});
   if(error)throw error;
   return data;
  },
  quote(segments,used){return {cents:priceExport(segments),free:freeExportEligible(segments,used)};}
 };
}
