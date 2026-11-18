import {formatBRL} from './commercial-pricing.js';

const make=(tag,text='',className='')=>{
 const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;
};
function renderTable(root,columns,rows){
 const table=make('table');table.style.width='100%';table.style.fontSize='12px';
 const head=make('thead'),headRow=make('tr');
 for(const [,label] of columns)headRow.append(make('th',label));
 head.append(headRow);table.append(head);
 const body=make('tbody');
 for(const item of rows){const tr=make('tr');for(const [key] of columns){const td=make('td',String(item[key]??'—'));td.style.padding='8px';tr.append(td);}body.append(tr);}
 table.append(body);root.replaceChildren(table);
 if(!rows.length)root.append(make('p','Nenhum registro.'));
}
export function mountAdminPanel({sb,root}){
 if(!root||!sb?.rpc)throw new TypeError('Painel ADM indisponível.');
 root.hidden=true;
 let epoch=0,authorized=false,busy=false;
 const heading=make('h3','Enzo Salmazo · Painel ADM');
 const unlimited=make('p','∞  Créditos ilimitados · Acesso administrativo','muted');
 const note=make('p','Ajustes são registrados e auditados no banco. Nunca informe chaves secretas aqui.','muted');
 const status=make('p','','muted');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const refreshButton=make('button','Atualizar dados');refreshButton.type='button';
 const usersArea=make('div'),walletArea=make('div'),reservationArea=make('div'),ledgerArea=make('div'),auditArea=make('div');
 const form=make('form');form.autocomplete='off';
 const user=make('input'),paid=make('input'),bonus=make('input'),reason=make('textarea');
 user.placeholder='UUID do usuário';user.required=true;user.maxLength=36;
 paid.type='number';paid.step='0.01';paid.value='0';paid.placeholder='Crédito pago (R$)';
 bonus.type='number';bonus.step='0.01';bonus.value='0';bonus.placeholder='Bônus (R$)';
 reason.placeholder='Justificativa detalhada (mínimo 12 caracteres)';reason.required=true;reason.minLength=12;reason.maxLength=500;
 const submit=make('button','Registrar ajuste financeiro');submit.type='submit';
 form.append(make('h4','Ajuste auditado de saldo'),user,paid,bonus,reason,submit);
 const section=(title,content)=>{const wrap=make('section');wrap.append(make('h4',title),content);return wrap;};
 root.append(heading,unlimited,note,refreshButton,status,form,section('Usuários',usersArea),section('Carteiras',walletArea),section('Reservas',reservationArea),section('Extrato',ledgerArea),section('Auditoria administrativa',auditArea));
 const cents=value=>{const n=Number(value);if(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n)>1000)throw Error('Valor fora do limite de R$ 1.000,00 por ajuste.');return Math.round(n*100);};
 async function refresh(){
  if(!authorized)return;
  const seq=++epoch;status.textContent='Consultando registros administrativos…';
  const {data,error}=await sb.rpc('viral_admin_overview',{p_limit:40});
  if(seq!==epoch)return;
  if(error){status.textContent='Falha ao consultar: '+error.message;return;}
  renderTable(usersArea,[['id','ID'],['email','E-mail'],['created_at','Cadastro'],['last_sign_in_at','Último acesso']],data?.users||[]);
  const wallets=(data?.wallets||[]).map(x=>({...x,paid_cents:formatBRL(x.paid_cents),bonus_cents:formatBRL(x.bonus_cents)}));
  renderTable(walletArea,[['user_id','Usuário'],['paid_cents','Pago'],['bonus_cents','Bônus'],['free_exports_used','Grátis usados']],wallets);
  renderTable(reservationArea,[['id','Reserva'],['user_id','Usuário'],['total_cents','Centavos'],['status','Estado'],['created_at','Data']],data?.reservations||[]);
  renderTable(ledgerArea,[['user_id','Usuário'],['kind','Operação'],['paid_delta','Pago (cent.)'],['bonus_delta','Bônus (cent.)'],['created_at','Data']],data?.ledger||[]);
  renderTable(auditArea,[['actor_id','Administrador'],['target_user_id','Usuário'],['action','Ação'],['amount_cents','Pago (cent.)'],['bonus_amount_cents','Bônus (cent.)'],['reason','Justificativa']],data?.audit||[]);
  status.textContent='Registros atualizados a partir do Supabase.';
 }
 async function check(){
  const seq=++epoch;
  try{
   const {data,error}=await sb.rpc('viral_admin_is_member');
   if(seq!==epoch)return;
   authorized=!error&&data===true;root.hidden=!authorized;
   if(authorized)await refresh();
  }catch{if(seq===epoch){authorized=false;root.hidden=true;}}
 }
 refreshButton.onclick=()=>{void refresh();};
 form.onsubmit=async event=>{
  event.preventDefault();if(!authorized||busy)return;
  try{
   const p=cents(paid.value),b=cents(bonus.value);
   if(p===0&&b===0)throw Error('Informe um ajuste diferente de zero.');
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.value.trim()))throw Error('UUID inválido.');
   if(reason.value.trim().length<12)throw Error('Justificativa muito curta.');
   if(!confirm('Confirmar ajuste financeiro de '+formatBRL(p)+' pago e '+formatBRL(b)+' bônus? Esta ação será auditada.'))return;
   busy=true;submit.disabled=true;status.textContent='Registrando ajuste…';
   const {error}=await sb.rpc('viral_admin_adjust_wallet',{p_user_id:user.value.trim(),p_paid_delta:p,p_bonus_delta:b,p_reason:reason.value.trim(),p_request_key:crypto.randomUUID()});
   if(error)throw error;
   status.textContent='Ajuste registrado com sucesso.';paid.value='0';bonus.value='0';reason.value='';
   await refresh();
  }catch(e){status.textContent='Ajuste não realizado: '+e.message;}
  finally{busy=false;submit.disabled=false;}
 };
 return {check,refresh,clear(){epoch++;authorized=false;root.hidden=true;usersArea.replaceChildren();walletArea.replaceChildren();reservationArea.replaceChildren();ledgerArea.replaceChildren();auditArea.replaceChildren();status.textContent='';}};
}
