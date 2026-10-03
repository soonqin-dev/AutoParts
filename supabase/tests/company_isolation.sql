-- Run in SQL Editor as postgres AFTER both SalesGo migrations succeed.
-- Tests use synthetic users, not your login. All test records are ROLLED BACK.
-- No emails are sent and no Storage objects/files are created or deleted.
begin;

select set_config('salesgo.test.user_a', gen_random_uuid()::text, true);
select set_config('salesgo.test.user_b', gen_random_uuid()::text, true);
select set_config('salesgo.test.user_sales', gen_random_uuid()::text, true);
select set_config('salesgo.test.user_disabled', gen_random_uuid()::text, true);
select set_config('salesgo.test.company_a', gen_random_uuid()::text, true);
select set_config('salesgo.test.company_b', gen_random_uuid()::text, true);

insert into auth.users(id, aud, role, email)
select current_setting('salesgo.test.' || key)::uuid, 'authenticated', 'authenticated',
  current_setting('salesgo.test.' || key) || '@salesgo-test.invalid'
from unnest(array['user_a','user_b','user_sales','user_disabled']) as key;

insert into public.companies(id, name, created_by) values
  (current_setting('salesgo.test.company_a')::uuid, 'Isolation test A', current_setting('salesgo.test.user_a')::uuid),
  (current_setting('salesgo.test.company_b')::uuid, 'Isolation test B', current_setting('salesgo.test.user_b')::uuid);
insert into public.company_members(company_id, user_id, role, active) values
  (current_setting('salesgo.test.company_a')::uuid, current_setting('salesgo.test.user_a')::uuid, 'admin', true),
  (current_setting('salesgo.test.company_b')::uuid, current_setting('salesgo.test.user_b')::uuid, 'admin', true),
  (current_setting('salesgo.test.company_a')::uuid, current_setting('salesgo.test.user_sales')::uuid, 'sales', true),
  (current_setting('salesgo.test.company_a')::uuid, current_setting('salesgo.test.user_disabled')::uuid, 'sales', false);
insert into public.products(company_id, serial, name, price) values
  (current_setting('salesgo.test.company_a')::uuid, 'ISOLATION-A', 'Isolation product A', 1),
  (current_setting('salesgo.test.company_b')::uuid, 'ISOLATION-B', 'Isolation product B', 2);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('salesgo.test.user_a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('salesgo.test.user_a'), 'role', 'authenticated')::text, true);
do $$
declare changed integer;
begin
  if (select count(*) from public.companies) <> 1 or
     (select count(*) from public.company_members) <> 1 or
     (select count(*) from public.products) <> 1 then
    raise exception 'FAIL: Company A read isolation';
  end if;
  if exists(select 1 from public.products where company_id = current_setting('salesgo.test.company_b')::uuid) then
    raise exception 'FAIL: Company A can read Company B';
  end if;
  begin
    insert into public.products(company_id, serial, name, price)
    values (current_setting('salesgo.test.company_b')::uuid, 'INJECT', 'Invalid', 1);
    raise exception 'FAIL: foreign-company insert allowed';
  exception when insufficient_privilege then null;
  end;
  update public.products set name='Invalid' where company_id=current_setting('salesgo.test.company_b')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: foreign-company update allowed'; end if;
  begin
    update public.products set company_id=current_setting('salesgo.test.company_b')::uuid;
    raise exception 'FAIL: ownership change allowed';
  exception when insufficient_privilege then null;
  end;
  update public.products set name='Valid admin update' where company_id=current_setting('salesgo.test.company_a')::uuid and revision=1;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: admin update denied'; end if;
  update public.products set name='Stale update' where company_id=current_setting('salesgo.test.company_a')::uuid and revision=1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: stale revision accepted'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('salesgo.test.user_b'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('salesgo.test.user_b'), 'role', 'authenticated')::text, true);
do $$ begin
  if (select count(*) from public.products) <> 1 or
     exists(select 1 from public.products where company_id=current_setting('salesgo.test.company_a')::uuid) then
    raise exception 'FAIL: Company B read isolation';
  end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('salesgo.test.user_sales'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('salesgo.test.user_sales'), 'role', 'authenticated')::text, true);
do $$
declare changed integer;
begin
  if (select count(*) from public.products) <> 1 then raise exception 'FAIL: sales read denied'; end if;
  update public.products set name='Invalid sales write';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: sales write allowed'; end if;
  begin
    update public.company_members set role='admin';
    raise exception 'FAIL: self-promotion allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('salesgo.test.user_disabled'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('salesgo.test.user_disabled'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists(select 1 from public.companies) or exists(select 1 from public.company_members) or exists(select 1 from public.products) then
    raise exception 'FAIL: disabled member can read company data';
  end if;
end $$;

set local role anon;
do $$ begin
  begin
    perform 1 from public.products;
    raise exception 'FAIL: anonymous product access allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'PASS: company isolation, admin/sales permissions, disabled/anonymous access and stale-write protection. Test records rolled back.' as result;
