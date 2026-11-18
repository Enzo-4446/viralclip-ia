-- VIRAL IA commercial wallet foundation. REVIEW BEFORE APPLYING TO PRODUCTION.
-- Apply only to the Supabase project matching VITE_SUPABASE_URL.
create table if not exists public.viral_wallets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 paid_cents bigint not null default 0 check (paid_cents >= 0),
 bonus_cents bigint not null default 0 check (bonus_cents >= 0),
 free_exports_used integer not null default 0 check (free_exports_used between 0 and 5),
 updated_at timestamptz not null default now()
);
create table if not exists public.viral_export_reservations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_key uuid not null,
 segments jsonb not null,
 total_cents bigint not null check (total_cents >= 0),
 paid_debit_cents bigint not null default 0 check (paid_debit_cents >= 0),
 bonus_debit_cents bigint not null default 0 check (bonus_debit_cents >= 0),
 free_debit integer not null default 0 check (free_debit between 0 and 5),
 status text not null default 'reserved' check (status in ('reserved','completed','cancelled')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(user_id,request_key),
 check (total_cents=paid_debit_cents+bonus_debit_cents)
);
create table if not exists public.viral_wallet_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 reservation_id uuid references public.viral_export_reservations(id),
 kind text not null check (kind in ('reserve','refund','payment','bonus','admin')),
 paid_delta bigint not null default 0,
 bonus_delta bigint not null default 0,
 free_delta integer not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists viral_wallet_ledger_user_date on public.viral_wallet_ledger(user_id,created_at desc);
create index if not exists viral_export_reservations_user_date on public.viral_export_reservations(user_id,created_at desc);

alter table public.viral_wallets enable row level security;
alter table public.viral_export_reservations enable row level security;
alter table public.viral_wallet_ledger enable row level security;
revoke all on public.viral_wallets,public.viral_export_reservations,public.viral_wallet_ledger from anon,authenticated;
grant select on public.viral_wallets,public.viral_export_reservations,public.viral_wallet_ledger to authenticated;
drop policy if exists viral_wallets_own_read on public.viral_wallets;
create policy viral_wallets_own_read on public.viral_wallets for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists viral_reservations_own_read on public.viral_export_reservations;
create policy viral_reservations_own_read on public.viral_export_reservations for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists viral_ledger_own_read on public.viral_wallet_ledger;
create policy viral_ledger_own_read on public.viral_wallet_ledger for select to authenticated using (user_id=(select auth.uid()));

-- RPC is intentionally SECURITY DEFINER: callers cannot directly mutate wallets.
-- Every caller is bound to auth.uid(); never accept user_id as a parameter.
create or replace function public.viral_reserve_export(p_request_key uuid,p_segments jsonb)
returns public.viral_export_reservations
language plpgsql security definer set search_path=''
as $$
declare
 v_user uuid := auth.uid();
 v_wallet public.viral_wallets%rowtype;
 v_existing public.viral_export_reservations%rowtype;
 v_res public.viral_export_reservations%rowtype;
 v_count integer;
 v_seconds numeric;
 v_cost bigint := 0;
 v_free boolean := true;
 v_free_debit integer := 0;
 v_paid bigint := 0;
 v_bonus bigint := 0;
 v_item jsonb;
begin
 if v_user is null then raise exception 'Faça login para exportar.'; end if;
 if p_request_key is null or jsonb_typeof(p_segments) <> 'array' then raise exception 'Pedido de exportação inválido.'; end if;
 v_count := jsonb_array_length(p_segments);
 if v_count not between 1 and 10 then raise exception 'Escolha de 1 a 10 clipes.'; end if;
 for v_item in select value from jsonb_array_elements(p_segments) loop
   if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item->'length') <> 'number' then
     raise exception 'Duração de clipe inválida.';
   end if;
   v_seconds := (v_item->>'length')::numeric;
   if v_seconds <= 0 or v_seconds > 120 then raise exception 'Cada clipe deve durar de 0 a 120 segundos.'; end if;
   if v_seconds > 60 then v_free := false; end if;
   v_cost := v_cost + ceil(v_seconds / 30)::bigint * 10;
 end loop;
 insert into public.viral_wallets(user_id) values(v_user) on conflict(user_id) do nothing;
 select * into v_wallet from public.viral_wallets where user_id=v_user for update;
 select * into v_existing from public.viral_export_reservations where user_id=v_user and request_key=p_request_key;
 if found then
   if v_existing.segments <> p_segments then raise exception 'Esta chave já foi usada para outro pedido.'; end if;
   return v_existing;
 end if;
 if v_free and v_wallet.free_exports_used+v_count<=5 then
   v_free_debit := v_count;
   v_cost := 0;
 else
   v_bonus := least(v_wallet.bonus_cents,v_cost);
   v_paid := v_cost-v_bonus;
   if v_wallet.paid_cents < v_paid then raise exception 'Créditos insuficientes. Recarregue sua carteira.'; end if;
 end if;
 update public.viral_wallets set paid_cents=paid_cents-v_paid,bonus_cents=bonus_cents-v_bonus,
 free_exports_used=free_exports_used+v_free_debit,updated_at=now() where user_id=v_user;
 insert into public.viral_export_reservations(user_id,request_key,segments,total_cents,paid_debit_cents,bonus_debit_cents,free_debit)
 values(v_user,p_request_key,p_segments,v_cost,v_paid,v_bonus,v_free_debit) returning * into v_res;
 insert into public.viral_wallet_ledger(user_id,reservation_id,kind,paid_delta,bonus_delta,free_delta)
 values(v_user,v_res.id,'reserve',-v_paid,-v_bonus,v_free_debit);
 return v_res;
end $$;

create or replace function public.viral_finish_export(p_reservation_id uuid,p_success boolean)
returns public.viral_export_reservations
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := auth.uid(); v_res public.viral_export_reservations%rowtype;
begin
 if v_user is null then raise exception 'Faça login novamente.'; end if;
 if p_success is null then raise exception 'Informe o resultado da exportação.'; end if;
 perform 1 from public.viral_wallets where user_id=v_user for update;
 select * into v_res from public.viral_export_reservations
 where id=p_reservation_id and user_id=v_user for update;
 if not found then raise exception 'Reserva não encontrada.'; end if;
 if v_res.status <> 'reserved' then return v_res; end if;
 if p_success then
   update public.viral_export_reservations set status='completed',completed_at=now() where id=v_res.id returning * into v_res;
 else
   update public.viral_wallets set paid_cents=paid_cents+v_res.paid_debit_cents,
   bonus_cents=bonus_cents+v_res.bonus_debit_cents,
   free_exports_used=free_exports_used-v_res.free_debit,updated_at=now() where user_id=v_user;
   update public.viral_export_reservations set status='cancelled',completed_at=now() where id=v_res.id returning * into v_res;
   insert into public.viral_wallet_ledger(user_id,reservation_id,kind,paid_delta,bonus_delta,free_delta)
   values(v_user,v_res.id,'refund',v_res.paid_debit_cents,v_res.bonus_debit_cents,-v_res.free_debit);
 end if;
 return v_res;
end $$;
revoke all on function public.viral_reserve_export(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.viral_finish_export(uuid,boolean) from public,anon,authenticated;
grant execute on function public.viral_reserve_export(uuid,jsonb) to authenticated;
grant execute on function public.viral_finish_export(uuid,boolean) to authenticated;
-- Never grant direct wallet writes to browser roles.
