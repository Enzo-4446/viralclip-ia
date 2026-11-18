/** Commercial tariff helpers. UI estimates only; server must authorize debits. */
export const PACKAGES=Object.freeze([1000,2000,3000,4000,5000,9990].map(priceCents=>Object.freeze({priceCents,bonusCents:priceCents===9990?2500:0})));
export const FREE_CLIP_LIMIT=5;
export const FREE_MAX_SECONDS=60;
export const CENTS_PER_30_SECONDS=10;
export function priceClipSeconds(seconds){
  if(!Number.isFinite(seconds)||seconds<=0)throw new RangeError('Informe uma duração válida para o clipe.');
  return Math.ceil(seconds/30)*CENTS_PER_30_SECONDS;
}
export function priceExport(segments){
  if(!Array.isArray(segments)||!segments.length)throw new RangeError('Selecione pelo menos um clipe.');
  return segments.reduce((total,segment)=>total+priceClipSeconds(segment.length),0);
}
export function freeExportEligible(segments,used){
  return Number.isInteger(used)&&used>=0&&Array.isArray(segments)&&segments.length>0&&segments.every(s=>Number.isFinite(s.length)&&s.length>0&&s.length<=FREE_MAX_SECONDS)&&used+segments.length<=FREE_CLIP_LIMIT;
}
export function packageForCents(cents){return PACKAGES.find(p=>p.priceCents===cents)||null;}
export function formatBRL(cents){if(!Number.isSafeInteger(cents))throw new TypeError('Saldo inválido');return (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
