-- Run once in the SalesGo Supabase project's SQL Editor as postgres.
-- No existing product, quotation, or Auth user data is changed.
begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'sales')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_id_idx
  on public.company_members (user_id, company_id) where active;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

-- Explicit privileges are needed even when automatic table exposure is off.
revoke all on public.companies, public.company_members from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.companies, public.company_members to authenticated;

-- This initial API exposes only the caller's own active memberships.
-- No membership self-editing, role promotion, or direct company creation.
create policy members_read_own_active_membership
  on public.company_members for select to authenticated
  using (user_id = (select auth.uid()) and active);

create policy members_read_their_company
  on public.companies for select to authenticated
  using (exists (
    select 1 from public.company_members m
    where m.company_id = companies.id
      and m.user_id = (select auth.uid()) and m.active
  ));

-- A verified caller creates a company and its first admin atomically.
-- A user can own one company; retrying returns it without changing membership.
create function public.create_company(company_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_company_id uuid;
begin
  if caller_id is null then
    raise exception 'Please sign in first.' using errcode = '42501';
  end if;
  if company_name is null or char_length(btrim(company_name)) not between 1 and 120 then
    raise exception 'Company name must be between 1 and 120 characters.'
      using errcode = '22023';
  end if;

  insert into public.companies (name, created_by)
  values (btrim(company_name), caller_id)
  on conflict (created_by) do nothing
  returning id into new_company_id;

  if new_company_id is not null then
    insert into public.company_members (company_id, user_id, role)
    values (new_company_id, caller_id, 'admin');
  else
    select c.id into new_company_id from public.companies c
    join public.company_members m on m.company_id = c.id
    where c.created_by = caller_id and m.user_id = caller_id and m.active;
    if new_company_id is null then
      raise exception 'Company access is disabled. Contact your administrator.'
        using errcode = '42501';
    end if;
  end if;
  return new_company_id;
end;
$$;

revoke all on function public.create_company(text) from public, anon, authenticated;
grant execute on function public.create_company(text) to authenticated;

commit;

-- Both rows must report row_security_enabled = true.
select tablename, rowsecurity as row_security_enabled
from pg_tables
where schemaname = 'public' and tablename in ('companies', 'company_members');
