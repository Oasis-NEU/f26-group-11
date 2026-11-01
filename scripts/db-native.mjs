// Windows fallback when Docker Desktop is unavailable. Runtime/data stay ignored.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = path.join(root, '.local');
const data = path.join(local, 'postgres-data');
const binary = name => path.join(local, 'postgres-runtime', 'native', 'bin', `${name}.exe`);
const action = process.argv[2];
const run = (name, args) => {
  // A background postgres process can inherit pipe handles on Windows. Use a
  // file for tool output so pg_ctl does not wait for an inherited pipe to close.
  const log = openSync(path.join(local, 'postgres-tools.log'), 'a');
  try {
    execFileSync(binary(name), args, {
      windowsHide: true, stdio: ['ignore', log, log], timeout: 45000,
    });
    return `${name} completed.`;
  } finally {
    closeSync(log);
  }
};

try {
  if (process.platform !== 'win32') throw new Error('Use db:up (Docker) on other platforms.');
  if (!['up', 'down', 'status'].includes(action)) throw new Error('Expected up, down, or status.');
  if (!existsSync(binary('pg_ctl'))) throw new Error('Install the Windows runtime first; see docs/database.md.');
  mkdirSync(local, { recursive: true });
  const envFile = path.join(root, '.env.db');
  if (!existsSync(envFile)) {
    const password = randomBytes(24).toString('hex');
    writeFileSync(envFile, `POSTGRES_PASSWORD=${password}\nPOSTGRES_PORT=5433\nDATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5433/khouryconnect\n`, { flag: 'wx', mode: 0o600 });
  }
  process.loadEnvFile(envFile);
  const url = new URL(process.env.DATABASE_URL);
  const port = Number(process.env.POSTGRES_PORT ?? 5433);
  if (url.hostname !== '127.0.0.1' || Number(url.port) !== port
      || url.pathname !== '/khouryconnect' || url.username !== 'postgres'
      || !Number.isInteger(port) || port < 1024 || port > 65535
      || !process.env.POSTGRES_PASSWORD
      || decodeURIComponent(url.password) !== process.env.POSTGRES_PASSWORD) {
    throw new Error('Native setup requires a matching localhost DATABASE_URL and POSTGRES_PASSWORD; see .env.db.example.');
  }
  if (action === 'status') {
    console.log(run('pg_ctl', ['-D', data, 'status']).trim());
  } else if (action === 'down') {
    console.log(run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']).trim());
  } else {
    if (!existsSync(path.join(data, 'PG_VERSION'))) {
      const passwordFile = path.join(local, 'initdb-password');
      writeFileSync(passwordFile, `${process.env.POSTGRES_PASSWORD}\n`, { mode: 0o600 });
      try {
        console.log(run('initdb', ['-D', data, '-U', 'postgres', '-E', 'UTF8', '--locale=C',
          '--auth=scram-sha-256', `--pwfile=${passwordFile}`]).trim());
      } finally {
        unlinkSync(passwordFile);
      }
    }
    const status = spawnSync(binary('pg_ctl'), ['-D', data, 'status'], { windowsHide: true });
    if (status.status !== 0) {
      console.log(run('pg_ctl', ['-D', data, '-l', path.join(local, 'postgres.log'),
        '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30', 'start']).trim());
    }
    const adminUrl = new URL(url);
    adminUrl.pathname = '/postgres';
    const client = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
    try {
      await client.connect();
      const exists = await client.query("select 1 from pg_database where datname = 'khouryconnect'");
      if (!exists.rowCount) await client.query('create database khouryconnect');
    } finally {
      await client.end();
    }
    console.log(`PostgreSQL is running on 127.0.0.1:${port}, database khouryconnect.`);
  }
} catch (error) {
  console.error(`Native database ${action} failed: ${error.message}`);
  if (existsSync(path.join(local, 'postgres-tools.log'))) {
    console.error(readFileSync(path.join(local, 'postgres-tools.log'), 'utf8').split('\n').slice(-8).join('\n'));
  }
  if (existsSync(path.join(local, 'postgres.log'))) {
    console.error(readFileSync(path.join(local, 'postgres.log'), 'utf8').split('\n').slice(-8).join('\n'));
  }
  process.exitCode = 1;
}
