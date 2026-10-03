const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

const uid = number => `00000000-0000-4000-a000-${String(number).padStart(12, "0")}`;
const A = uid(1), B = uid(2), SALES = uid(3), DISABLED = uid(4), CA = uid(11), CB = uid(12), PA = uid(21), PB = uid(22);
const pathA = `${CA}/${PA}/${uid(31)}.webp`;
const pathB = `${CB}/${PB}/${uid(32)}.webp`;
const unusedA = `${CA}/${PA}/${uid(33)}.png`;

test("PostgreSQL RLS: two companies, sales, disabled/anonymous members, immutable ownership and private images", async t => {
  const db = new PGlite();
  try {
    // Emulate ONLY platform schemas/functions. Both SalesGo migrations below
    // run unmodified in a real PostgreSQL engine, not a mocked policy evaluator.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, aud text, role text, email text);
      create function auth.uid() returns uuid language sql stable as
        $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
    `);
    await db.exec(`
      grant usage on schema auth, storage to authenticated, anon;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to authenticated, anon;
      create function storage.foldername(name text) returns text[] language sql immutable as
        $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1] $$;
    `);
    for (const file of ["202610030001_company_accounts.sql", "202610040001_cloud_products.sql"]) {
      await db.exec(readFileSync(join(__dirname, "../supabase/migrations", file), "utf8"));
    }
    await t.test("the SQL Editor verification script passes and rolls back every synthetic record", async () => {
      await db.exec(readFileSync(join(__dirname, "../supabase/tests/company_isolation.sql"), "utf8"));
      assert.equal((await db.query("select * from auth.users")).rows.length, 0);
      assert.equal((await db.query("select * from public.companies")).rows.length, 0);
    });
    await db.exec(`
      insert into auth.users(id) values ('${A}'), ('${B}'), ('${SALES}'), ('${DISABLED}');
      insert into public.companies(id,name,created_by) values ('${CA}','Company A','${A}'), ('${CB}','Company B','${B}');
      insert into public.company_members(company_id,user_id,role,active) values
        ('${CA}','${A}','admin',true), ('${CB}','${B}','admin',true),
        ('${CA}','${SALES}','sales',true), ('${CA}','${DISABLED}','sales',false);
      insert into public.products(id,company_id,serial,name,price,image_path,source_key) values
        ('${PA}','${CA}','A-001','Product A',10,'${pathA}','local-A'),
        ('${PB}','${CB}','B-001','Product B',20,'${pathB}',null);
      insert into storage.objects(bucket_id,name) values
        ('salesgo-products','${pathA}'), ('salesgo-products','${pathB}'), ('salesgo-products','${unusedA}');
    `);
    async function as(user, sql, role = "authenticated") {
      await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claims', '${JSON.stringify({ sub: user })}', true);`);
      try { return await db.query(sql); }
      finally { await db.exec("rollback;"); }
    }
    await t.test("company and own-membership reads are scoped, without recursive policies", async () => {
      assert.deepEqual((await as(A, "select name from public.companies")).rows, [{ name: "Company A" }]);
      assert.deepEqual((await as(B, "select name from public.companies")).rows, [{ name: "Company B" }]);
      assert.equal((await as(A, "select * from public.company_members")).rows.length, 1);
    });
    await t.test("company product reads and private image reads are isolated", async () => {
      assert.deepEqual((await as(A, "select name from public.products")).rows, [{ name: "Product A" }]);
      assert.deepEqual((await as(B, "select name from public.products")).rows, [{ name: "Product B" }]);
      assert.equal((await as(A, "select * from storage.objects")).rows.length, 2);
      assert.equal((await as(B, "select * from storage.objects")).rows.length, 1);
    });
    await t.test("foreign-company inserts, updates, uploads and deletes are denied", async () => {
      await assert.rejects(as(A, `insert into public.products(company_id,serial,name,price) values ('${CB}','X','Injected',1)`), /row-level security/);
      assert.equal((await as(A, `update public.products set name='Hacked' where id='${PB}' returning id`)).rows.length, 0);
      await assert.rejects(as(A, `insert into storage.objects(bucket_id,name) values ('salesgo-products','${CB}/${PB}/${uid(99)}.png')`), /row-level security/);
      assert.equal((await as(A, `delete from storage.objects where name='${pathB}' returning id`)).rows.length, 0);
    });
    await t.test("sales can read but cannot mutate products, images or their role", async () => {
      assert.equal((await as(SALES, "select * from public.products")).rows.length, 1);
      assert.equal((await as(SALES, "select * from storage.objects")).rows.length, 2);
      assert.equal((await as(SALES, `update public.products set name='Hacked' where id='${PA}' returning id`)).rows.length, 0);
      await assert.rejects(as(SALES, `insert into public.products(company_id,serial,name,price) values ('${CA}','X','Sales write',1)`), /row-level security/);
      await assert.rejects(as(SALES, `update public.company_members set role='admin' where user_id='${SALES}'`), /permission denied/);
      await assert.rejects(as(SALES, `insert into storage.objects(bucket_id,name) values ('salesgo-products','${CA}/${PA}/${uid(99)}.png')`), /row-level security/);
      assert.equal((await as(SALES, `delete from storage.objects returning id`)).rows.length, 0);
    });
    await t.test("disabled and anonymous callers cannot read company data or images", async () => {
      for (const table of ["companies", "company_members", "products", "storage.objects"]) {
        assert.equal((await as(DISABLED, `select * from ${table}`)).rows.length, 0);
      }
      await assert.rejects(as(A, "select * from public.products", "anon"), /permission denied/);
      assert.equal((await as(A, "select * from storage.objects", "anon")).rows.length, 0);
      await assert.rejects(as(A, "select public.create_company('No')", "anon"), /permission denied/);
    });
    await t.test("ownership, import identity and revision cannot be edited directly", async () => {
      for (const field of ["company_id", "id", "created_by"]) {
        await assert.rejects(as(A, `update public.products set ${field}='${CB}' where id='${PA}'`), /permission denied/);
      }
      await assert.rejects(as(A, `update public.products set revision=99 where id='${PA}'`), /permission denied/);
      await assert.rejects(as(A, `update public.products set source_key='changed' where id='${PA}'`), /permission denied/);
      await assert.rejects(as(A, `delete from public.products where id='${PA}'`), /permission denied/);
      await assert.rejects(as(A, `update public.products set image_path='${pathB}' where id='${PA}'`), /check constraint/);
    });
    await t.test("admin writes increment revision; stale optimistic writes match nothing", async () => {
      await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${A}"}',true);`);
      try {
        const saved = await db.query(`update public.products set name='Updated' where id='${PA}' and revision=1 returning revision`);
        assert.equal(saved.rows[0].revision, 2);
        assert.equal((await db.query(`update public.products set name='Stale' where id='${PA}' and revision=1 returning id`)).rows.length, 0);
      } finally { await db.exec("rollback;"); }
    });
    await t.test("live images cannot be deleted; unused images can; overwrite is denied", async () => {
      assert.equal((await as(A, `delete from storage.objects where name='${pathA}' returning id`)).rows.length, 0);
      assert.equal((await as(A, `delete from storage.objects where name='${unusedA}' returning id`)).rows.length, 1);
      assert.equal((await as(A, `update storage.objects set name='anything' where name='${pathA}' returning id`)).rows.length, 0);
    });
    await t.test("soft deletion hides products in active queries and retains import deduplication", async () => {
      await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${A}"}',true);`);
      try {
        await db.exec(`update public.products set deleted_at=now(),image_path=null where id='${PA}'`);
        assert.equal((await db.query("select * from public.products where deleted_at is null")).rows.length, 0);
        assert.equal((await db.query("select * from public.products where source_key='local-A'")).rows.length, 1);
        assert.equal((await db.query(`delete from storage.objects where name='${pathA}' returning id`)).rows.length, 1);
      } finally { await db.exec("rollback;"); }
    });
    await t.test("private bucket and RLS remain enabled; company creation does not reactivate disabled admins", async () => {
      assert.equal((await db.query("select public from storage.buckets where id='salesgo-products'")).rows[0].public, false);
      const tables = await db.query("select rowsecurity from pg_tables where schemaname='public' and tablename in ('companies','company_members','products')");
      assert.equal(tables.rows.length, 3); assert(tables.rows.every(row => row.rowsecurity));
      await db.exec(`update public.company_members set active=false where user_id='${A}'`);
      await assert.rejects(as(A, "select public.create_company('Reactivation attempt')"), /access is disabled/);
    });
  } finally { await db.close(); }
});
