-- Execute AFTER docs/viral-wallet-schema.sql when initializing a fresh project.
-- The production database already received these changes via Supabase migrations.
-- Browser callers may confirm success, but NEVER request a refund.
create or replace function public.viral_finish_export(p_reservation_id uuid,p_success boolean)
returns public.viral_export_reservations
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := auth.uid(); v_res public.viral_export_reservations%rowtype;
begin
 if v_user is null then raise exception 'Faça login novamente.'; end if;
 if p_success is distinct from true then raise exception 'Estornos exigem validação pelo servidor.'; end if;
 select * into v_res from public.viral_export_reservations
 where id=p_reservation_id and user_id=v_user for update;
 if not found then raise exception 'Reserva não encontrada.'; end if;
 if v_res.status='reserved' then
   update public.viral_export_reservations set status='completed',completed_at=now() where id=v_res.id returning * into v_res;
 end if;
 return v_res;
end $$;
revoke all on function public.viral_finish_export(uuid,boolean) from public,anon,authenticated;
grant execute on function public.viral_finish_export(uuid,boolean) to authenticated;

create or replace function public.viral_refund_export_service(p_reservation_id uuid)
returns public.viral_export_reservations
language plpgsql security definer set search_path=''
as $$
declare v_res public.viral_export_reservations%rowtype; v_user uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso negado.'; end if;
 select user_id into v_user from public.viral_export_reservations where id=p_reservation_id;
 if v_user is null then raise exception 'Reserva não encontrada.'; end if;
 perform 1 from public.viral_wallets where user_id=v_user for update;
 select * into v_res from public.viral_export_reservations where id=p_reservation_id and user_id=v_user for update;
 if not found then raise exception 'Reserva não encontrada.'; end if;
 if v_res.status <> 'reserved' then return v_res; end if;
 update public.viral_wallets set paid_cents=paid_cents+v_res.paid_debit_cents,bonus_cents=bonus_cents+v_res.bonus_debit_cents,
 free_exports_used=free_exports_used-v_res.free_debit,updated_at=now() where user_id=v_user;
 update public.viral_export_reservations set status='cancelled',completed_at=now() where id=v_res.id returning * into v_res;
 insert into public.viral_wallet_ledger(user_id,reservation_id,kind,paid_delta,bonus_delta,free_delta)
 values(v_user,v_res.id,'refund',v_res.paid_debit_cents,v_res.bonus_debit_cents,-v_res.free_debit);
 return v_res;
end $$;
revoke all on function public.viral_refund_export_service(uuid) from public,anon,authenticated;
grant execute on function public.viral_refund_export_service(uuid) to service_role;
