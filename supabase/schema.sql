-- Baron cloud sync — run once in a new Supabase project (SQL editor → New query → Run).
-- Then in Baron: ☰ Menu → CLOUD SYNC → paste the project URL + publishable key.
-- Every row is locked to its owner by row-level security; the publishable key is safe to share.

create table public.baron_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  device text,
  updated_at timestamptz not null default now()
);
alter table public.baron_state enable row level security;
create policy "own state select" on public.baron_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own state insert" on public.baron_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own state update" on public.baron_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Compare-and-swap write: succeeds only if the caller saw the latest rev,
-- otherwise hands back the cloud copy so the device can merge.
create or replace function public.push_state(p_data jsonb, p_base_rev bigint, p_device text default null)
returns table(ok boolean, rev bigint, data jsonb, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur public.baron_state%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into cur from public.baron_state s where s.user_id = uid for update;
  if not found then
    insert into public.baron_state(user_id, data, rev, device) values (uid, p_data, 1, p_device)
      returning * into cur;
    return query select true, cur.rev, null::jsonb, cur.updated_at;
    return;
  end if;
  if cur.rev <> p_base_rev then
    return query select false, cur.rev, cur.data, cur.updated_at;
    return;
  end if;
  update public.baron_state s set data = p_data, rev = s.rev + 1, device = p_device, updated_at = now()
    where s.user_id = uid returning * into cur;
  return query select true, cur.rev, null::jsonb, cur.updated_at;
end $$;
revoke all on function public.push_state(jsonb, bigint, text) from public, anon;
grant execute on function public.push_state(jsonb, bigint, text) to authenticated;
