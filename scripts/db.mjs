import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const tables = [
  'users', 'communities', 'posts', 'post_votes', 'community_members',
  'community_posts', 'professors', 'community_profs', 'comments',
  'course_offerings', 'enrollments',
];

// Exact before/after pairs for the requested SQL capitalization update.
// Existing ledgers stay valid; any further file change still fails verification.
const capitalizationChecksums = {
  '20261101000000_create_khouryconnect.sql': {
    original: '4bdd323dc7f0335637cad145a072e7d8f469b733719651af5d048a8c4233806e',
    formatted: 'd7c7beddfd3f815aec8bb2e6322f2a6f2bcd3314fe0cacef51cc4000b20c832d',
  },
  '20261101010000_supabase_auth_and_access.sql': {
    original: '1330168c96e6eacd18749ea9edbad8aa93e7ef5a6262d3b68fde6c45ffe144f5',
    formatted: '197d7af4f99d0dbf871b6f0df72e4dd75ca572fcaae1b332e0fda4be30f64a41',
  },
};

async function migrate(client) {
  // Session lock serializes concurrent runners, including initial ledger setup.
  await client.query('select pg_advisory_lock(20261101, 11)');
  await client.query(`
    create schema if not exists app_private;
    revoke all on schema app_private from public;
    create table if not exists app_private.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
  const { rows } = await client.query('select name, checksum from app_private.schema_migrations');
  const applied = new Map(rows.map(row => [row.name, row.checksum]));
  for (const name of applied.keys()) {
    if (!files.includes(name)) throw new Error(`Applied migration is missing locally: ${name}`);
  }
  let count = 0;
  let skipped = 0;
  for (const name of files) {
    // Git may check out CRLF on Windows; line endings must not change checksums.
    const sql = (await readFile(new URL(name, directory), 'utf8')).replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(name)) {
      const knownFormat = capitalizationChecksums[name];
      const matchesCapitalizationUpdate = knownFormat
        && applied.get(name) === knownFormat.original
        && checksum === knownFormat.formatted;
      if (applied.get(name) !== checksum && !matchesCapitalizationUpdate) {
        throw new Error(`Applied migration changed: ${name}. Add a new migration instead.`);
      }
      continue;
    }
    // The native PostgreSQL workflow has no Supabase-managed Auth schema.
    // Never record a skipped migration: linking a real Supabase project must
    // still apply its auth mapping and policies through the Supabase CLI.
    if (sql.startsWith('-- requires: supabase-auth')) {
      const { rows: prerequisites } = await client.query(
        "select to_regclass('auth.users') is not null and to_regprocedure('auth.uid()') is not null as ready",
      );
      if (!prerequisites[0].ready) {
        console.log(`Pending (requires Supabase Auth): ${name}`);
        skipped++;
        continue;
      }
    }
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(
        'insert into app_private.schema_migrations (name, checksum) values ($1, $2)',
        [name, checksum],
      );
      await client.query('commit');
      console.log(`Applied ${name}`);
      count++;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
  console.log(count ? `${count} migration(s) applied.` : 'No standalone migrations to apply.');
  if (skipped) console.log(`${skipped} Supabase-only migration(s) pending; not recorded as applied.`);
}

async function status(client) {
  const { rows: migrations } = await client.query(
    'select name, applied_at from app_private.schema_migrations order by name',
  );
  console.table(migrations);
  const counts = [];
  for (const table of tables) {
    // Identifiers come only from the fixed allowlist above.
    const { rows } = await client.query(`select count(*)::int as count from public.${table}`);
    counts.push({ table, records: rows[0].count });
  }
  console.table(counts);
}

const command = process.argv[2];
if (!['migrate', 'status'].includes(command)) {
  console.error('Usage: node scripts/db.mjs <migrate|status>');
  process.exitCode = 1;
} else if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in .env.db or the environment. See docs/database.md.');
  process.exitCode = 1;
} else {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await (command === 'migrate' ? migrate(client) : status(client));
  } catch (error) {
    console.error(`Database ${command} failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
