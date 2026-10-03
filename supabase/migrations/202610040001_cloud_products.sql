-- Apply once AFTER 202610030001_company_accounts.sql. Run as postgres.
-- Creates new objects only; never replaces the existing company/member policies.
begin;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  serial text not null check (char_length(btrim(serial)) between 1 and 120),
  name text not null check (char_length(btrim(name)) between 1 and 240),
  tags text[] not null default '{}' check (cardinality(tags) <= 20 and char_length(array_to_string(tags, ',')) <= 2000),
  price numeric(9,2) not null check (price >= 0 and price <= 9999999.99),
  image_path text,
  source_key text check (source_key is null or char_length(source_key) between 1 and 240),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  deleted_at timestamptz,
  unique (company_id, source_key),
  check (image_path is null or (
    image_path like company_id::text || '/' || id::text || '/%'
    and image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
  ))
);

create unique index products_company_serial_idx on public.products(company_id, lower(btrim(serial)))
  where deleted_at is null;
create index products_company_created_idx on public.products(company_id, created_at desc, id)
  where deleted_at is null;

create function public.stamp_product_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function public.stamp_product_update() from public, anon, authenticated;
create trigger stamp_product_update before update on public.products
  for each row execute function public.stamp_product_update();

alter table public.products enable row level security;
revoke all on public.products from public, anon, authenticated;
grant select on public.products to authenticated;
grant insert (id, company_id, serial, name, tags, price, image_path, source_key) on public.products to authenticated;
grant update (serial, name, tags, price, image_path, deleted_at) on public.products to authenticated;

create policy members_read_company_products on public.products for select to authenticated
using (exists (select 1 from public.company_members m
  where m.company_id = products.company_id and m.user_id = (select auth.uid()) and m.active));
create policy admins_insert_company_products on public.products for insert to authenticated
with check (exists (select 1 from public.company_members m
  where m.company_id = products.company_id and m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));
create policy admins_update_company_products on public.products for update to authenticated
using (exists (select 1 from public.company_members m
  where m.company_id = products.company_id and m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
with check (exists (select 1 from public.company_members m
  where m.company_id = products.company_id and m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));

-- Soft deletion retains source_key so importing a backup cannot resurrect deleted items.
-- Blob deletion is done through Storage API, never by deleting storage.objects in SQL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('salesgo-products', 'salesgo-products', false, 5242880,
  array['image/webp', 'image/jpeg', 'image/png']);

create policy salesgo_members_read_images on storage.objects for select to authenticated
using (bucket_id = 'salesgo-products' and exists (
  select 1 from public.company_members m
  where m.company_id::text = (storage.foldername(name))[1]
    and m.user_id = (select auth.uid()) and m.active
));
create policy salesgo_admins_upload_images on storage.objects for insert to authenticated
with check (bucket_id = 'salesgo-products'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
  and exists (select 1 from public.company_members m
    where m.company_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));
-- No UPDATE policy: each replacement is a new object, never an overwrite.
create policy salesgo_admins_remove_unused_images on storage.objects for delete to authenticated
using (bucket_id = 'salesgo-products' and exists (
  select 1 from public.company_members m
  where m.company_id::text = (storage.foldername(name))[1]
    and m.user_id = (select auth.uid()) and m.active and m.role = 'admin'
) and not exists (select 1 from public.products p
  where p.image_path = storage.objects.name and p.deleted_at is null));

commit;

select tablename, rowsecurity as row_security_enabled
from pg_tables where schemaname = 'public' and tablename = 'products';
select id, public, file_size_limit from storage.buckets where id = 'salesgo-products';
