import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const baseMigration = new URL('../supabase/migrations/20261101000000_create_khouryconnect.sql', import.meta.url);
const authMigration = new URL('../supabase/migrations/20261101010000_supabase_auth_and_access.sql', import.meta.url);

test('Supabase identity mapping and API grants in an isolated PostgreSQL database', async t => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL to a local PostgreSQL test server.');
  const source = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname),
    'Auth stub tests run only on localhost, never against a hosted Supabase project.');
  // A generated database avoids changing the persistent application's schema.
  const database = `khouryconnect_auth_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^khouryconnect_auth_test_[a-f0-9]{32}$/);
  const admin = new pg.Client({ connectionString: source.toString() });
  let isolated;
  await admin.connect();
  try {
    await admin.query(`create database "${database}"`);
    source.pathname = `/${database}`;
    isolated = new pg.Client({ connectionString: source.toString() });
    await isolated.connect();
    await isolated.query('begin');
    // Roles are cluster objects. Any missing stub roles are created inside this
    // transaction and rolled back; preexisting roles are never changed.
    await isolated.query('select pg_advisory_xact_lock(20261101, 12)');
    await isolated.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end $$`);
    const baseSql = await readFile(baseMigration, 'utf8');
    const authSql = await readFile(authMigration, 'utf8');
    await isolated.query(baseSql);

    async function rejects(sql, values, code, message) {
      await isolated.query('savepoint expected_failure');
      try {
        await assert.rejects(() => isolated.query(sql, values),
          error => error.code === code && (!message || message.test(error.message)));
      } finally {
        await isolated.query('rollback to savepoint expected_failure');
        await isolated.query('release savepoint expected_failure');
      }
    }
    async function asRole(role, user, action) {
      assert.ok(['anon', 'authenticated'].includes(role));
      await isolated.query('savepoint role_fixture');
      await isolated.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? '']);
      await isolated.query(`set local role ${role}`);
      try {
        return await action();
      } catch (error) {
        await isolated.query('rollback to savepoint role_fixture');
        throw error;
      } finally {
        await isolated.query('reset role');
        await isolated.query('release savepoint role_fixture');
      }
    }

    await t.test('migration fails clearly when Supabase Auth is absent', async () => {
      await rejects(authSql, [], 'P0001', /requires Supabase Auth/);
    });
    await isolated.query(`
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      -- Reproduce broad defaults found on older Supabase projects.
      grant all on all tables in schema public to anon, authenticated;
      grant all on all sequences in schema public to anon, authenticated;
    `);
    const alice = randomUUID();
    const bob = randomUUID();
    const signup = randomUUID();
    const phone = randomUUID();
    await isolated.query(`insert into auth.users (id, email, raw_user_meta_data)
      values ($1, 'alice@example.test', '{"first_name":"Auth Alice"}'),
             ($2, 'bob@example.test', '{}')`, [alice, bob]);
    await isolated.query(`insert into public.users (user_id, email, first_name)
      values ($1, 'old-alice@example.test', 'Profile Alice')`, [alice]);

    await t.test('unmapped existing profiles fail without guessing by email', async () => {
      await isolated.query('savepoint orphan_fixture');
      try {
        await isolated.query(`insert into public.users (user_id, email)
          values ($1, 'orphan@example.test')`, [randomUUID()]);
        await rejects(authSql, [], 'P0001', /explicitly mapped/);
      } finally {
        await isolated.query('rollback to savepoint orphan_fixture');
        await isolated.query('release savepoint orphan_fixture');
      }
    });
    await isolated.query(authSql);
    await isolated.query(`insert into public.communities
      (community_id, course_code, course_name, slug)
      values (-1, 'TEST101', 'Test course', 'test101')`);

    await t.test('backfill maps IDs and canonical emails while preserving existing profiles', async () => {
      const { rows } = await isolated.query(`select user_id, email, first_name, display_name
        from public.users order by email`);
      assert.deepEqual(rows, [
        { user_id: alice, email: 'alice@example.test', first_name: 'Profile Alice', display_name: null },
        { user_id: bob, email: 'bob@example.test', first_name: null, display_name: null },
      ]);
    });
    await t.test('signup creates a nullable profile and Auth email changes synchronize', async () => {
      await isolated.query(`insert into auth.users (id, email, raw_user_meta_data)
        values ($1, 'new@example.test', '{"display_name":"New student","role":"admin"}')`, [signup]);
      let result = await isolated.query('select * from public.users where user_id = $1', [signup]);
      assert.equal(result.rows[0].display_name, 'New student');
      assert.equal(result.rows[0].first_name, null);
      assert.ok(!('role' in result.rows[0]));
      await isolated.query("update auth.users set email = 'updated@example.test' where id = $1", [signup]);
      result = await isolated.query('select email, display_name from public.users where user_id = $1', [signup]);
      assert.deepEqual(result.rows[0], { email: 'updated@example.test', display_name: 'New student' });
      await rejects('update auth.users set email = null where id = $1', [signup], '23514');
    });
    await t.test('an email-less identity gains a profile when an email is added', async () => {
      await isolated.query('insert into auth.users (id) values ($1)', [phone]);
      assert.equal((await isolated.query('select * from public.users where user_id = $1', [phone])).rowCount, 0);
      await isolated.query("update auth.users set email = 'phone@example.test' where id = $1", [phone]);
      assert.equal((await isolated.query('select * from public.users where user_id = $1', [phone])).rowCount, 1);
    });
    await t.test('anonymous clients read communities and cannot read profiles or write', async () => {
      await asRole('anon', null, async () => {
        assert.equal((await isolated.query('select * from public.communities')).rowCount, 1);
        await rejects('select * from public.users', [], '42501');
        await rejects("update public.communities set description = 'changed'", [], '42501');
      });
    });
    await t.test('authenticated clients read and update only their own safe profile fields', async () => {
      await asRole('authenticated', alice, async () => {
        const { rows } = await isolated.query('select user_id from public.users');
        assert.deepEqual(rows, [{ user_id: alice }]);
        assert.equal((await isolated.query("update public.users set bio = 'Own bio' where user_id = $1", [alice])).rowCount, 1);
        assert.equal((await isolated.query("update public.users set bio = 'Other bio' where user_id = $1", [bob])).rowCount, 0);
        await rejects("update public.users set email = 'spoof@example.test' where user_id = $1", [alice], '42501');
        await rejects('update public.users set user_id = $1 where user_id = $2', [randomUUID(), alice], '42501');
        await rejects("update public.users set comments_schema_note = 'changed'", [], '42501');
        await rejects("insert into public.users (user_id, email) values ($1, 'fake@example.test')", [randomUUID()], '42501');
        await rejects('delete from public.users where user_id = $1', [alice], '42501');
      });
    });
    await t.test('remaining nine tables and identity sequences deny both API roles', async () => {
      const tables = ['posts', 'post_votes', 'community_members', 'community_posts',
        'professors', 'community_profs', 'comments', 'course_offerings', 'enrollments'];
      for (const role of ['anon', 'authenticated']) {
        await asRole(role, alice, async () => {
          for (const table of tables) await rejects(`select * from public.${table}`, [], '42501');
          const { rows } = await isolated.query(`select c.relname,
            has_sequence_privilege(current_user, c.oid, 'USAGE') as allowed
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'S'`);
          assert.equal(rows.length, 9);
          assert.ok(rows.every(row => !row.allowed));
          assert.equal((await isolated.query(`select has_function_privilege(current_user,
            p.oid, 'EXECUTE') as allowed from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_private' and p.proname = 'sync_auth_user_profile'`)).rows[0].allowed, false);
        });
      }
    });
    await t.test('Auth deletion and unknown profile identities cannot break the mapping', async () => {
      await rejects('delete from auth.users where id = $1', [alice], '23503');
      await rejects("insert into public.users (user_id, email) values ($1, 'unmapped@example.test')", [randomUUID()], '23503');
    });
  } finally {
    if (isolated) {
      await isolated.query('rollback').catch(() => {});
      await isolated.end();
    }
    // Only the exact generated database is dropped, after all fixtures and role
    // creation have rolled back and the sole test connection has closed.
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  }
});
