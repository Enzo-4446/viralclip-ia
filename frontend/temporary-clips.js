export const CLIP_TTL_MS=30*60*1000;
export function createTemporaryClips({revoke=url=>URL.revokeObjectURL(url),now=()=>Date.now()}={}){
 const clips=new Map();
 function track(url){if(!url||typeof url!=='string')throw new TypeError('Endereço temporário inválido');clips.set(url,now()+CLIP_TTL_MS);return url;}
 function sweep(){const current=now();let removed=0;for(const [url,expires] of clips){if(current>=expires){revoke(url);clips.delete(url);removed++;}}return removed;}
 function clear(){for(const url of clips.keys())revoke(url);clips.clear();}
 return {track,sweep,clear,size:()=>clips.size,expiresAt:url=>clips.get(url)??null};
}
