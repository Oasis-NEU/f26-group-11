# Hosted KhouryConnect database

Deployed November 1, 2026 to the existing project:

| Setting | Value |
| --- | --- |
| Organization | oasis-group11 |
| Project | KhouryForum |
| Reference | btlvghjxtukwgofcpxtq |
| Region | us-east-1 |
| PostgreSQL | 17 |
| API URL | https://btlvghjxtukwgofcpxtq.supabase.co |
| Dashboard | [Project dashboard](https://supabase.com/dashboard/project/btlvghjxtukwgofcpxtq) |

Both versioned SQL files in `supabase/migrations` are deployed. All 11 Airtable
tables were empty, so this deployment imports the schema without inventing data.
Verification used a temporary community with an explicit negative ID, then removed
it; it did not advance the identity sequence. All application tables remain empty.

## Connection and services

Supabase hosts PostgreSQL, Auth, and its generated `/rest/v1` Data API. FastAPI is
a separate Python service exposing `/api/v1`; it has not been deployed to a cloud
application host by this database setup.

This checkout's ignored `.env.local` and `api/.env` are configured with the
project URL and publishable key. No database password or service-role key is needed
for the configured `REPOSITORY_BACKEND=supabase`. The Next.js homepage now queries
`communities` instead of the nonexistent `todos` table. Generated types in
`utils/supabase/database.types.ts` keep its queries aligned with the hosted schema.

For a fresh checkout:

```powershell
npm ci
Copy-Item .env.example .env.local
Copy-Item api/.env.example api/.env
# Set the project URL/publishable key from the dashboard in both files.
# In api/.env set REPOSITORY_BACKEND=supabase; DEV_AUTH_ENABLED=false.
npm run supabase:check
npm run dev
```

Run FastAPI separately using [api/README.md](../api/README.md). It can instead
use direct PostgreSQL with `REPOSITORY_BACKEND=postgres` and a server-only
`DATABASE_URL`; use the dashboard's connection string with TLS and its session
pooler when IPv4 is required. Never put a database URL or service-role secret in
a `NEXT_PUBLIC_` variable.

## Access and identity

- Communities are publicly readable, consistent with the scaffold's public routes.
- A profile's `user_id` references `auth.users.id`. Email-account signup creates
  the profile, existing Auth accounts are backfilled, and Auth email changes sync.
  Phone-only/anonymous identities acquire a profile when they add an email.
- Authenticated users can read only their own profile and update their own name,
  academic fields, display name, bio, and avatar. Direct profile insert/delete,
  email changes, and identity changes are denied to Data API clients. Email changes
  go through Supabase Auth.
- Posts, votes, memberships, community links, professors, comments, offerings,
  and enrollments retain RLS with no browser/API grants or policies. Their feature
  endpoints and write permissions remain future work. The Supabase advisor reports
  nine informational [RLS-without-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  for this intentional denial; no warning or error security finding was returned.
- Auth account deletion is restricted while its application profile exists,
  preserving the original author/content deletion constraints. An explicit
  account/content cleanup flow is required before deletion.
- Existing profiles with unmatched Auth IDs cause migration failure instead of
  guessing ownership from an email. No global role or moderation model was added.

## Verified endpoints

All hosted requests below use the project's publishable key in the `apikey`
header. Requests without it are rejected by Supabase's gateway.

| Endpoint | Verified result |
| --- | --- |
| Supabase `GET /rest/v1/communities?select=community_id,course_code,course_name,slug,description,created_at` | `200 []` on the empty schema |
| Supabase `GET /rest/v1/users` without a user token | Denied (`401`) |
| Supabase reads of the other nine application tables without a user token | Denied (`401`) |
| Supabase `GET /auth/v1/user` with an invalid bearer token | Rejected (`403`) |
| Local FastAPI `GET /api/v1/health` | `200`, liveness only |
| Local FastAPI `GET /api/v1/communities` using the hosted Data API | `200 []`; also read a temporary hosted row successfully |
| Local FastAPI `GET /api/v1/communities/{slug}` | `200` for temporary hosted row with correct integer ID/columns; `404` for missing slug |
| Local FastAPI `GET /api/v1/me` | `401` for missing/invalid credentials and disabled development header |

The FastAPI suite also verifies successful profile responses against real local
PostgreSQL, with the Auth response simulated. A successful `/me` round trip with a
real signed-in hosted account has not been exercised; no account or email was
created for testing. After signing in, send its `access_token` as a bearer token
to `/api/v1/me` to exercise the full hosted profile flow.

`npm run supabase:check` repeats 12 read-only checks against the hosted REST/Auth
services. Local verification also passed 48 API tests (including real SQL route
tests), eight schema checks, ten isolated Auth/RLS checks, Ruff, ESLint, TypeScript,
and the production Next.js build.

## Subsequent migrations

The CLI is pinned in `package-lock.json`; run it through npm. This config is for
local development/migrations. Do not push local Auth configuration over the
existing hosted project's settings.

```powershell
npm run supabase -- login
npm run supabase -- link --project-ref btlvghjxtukwgofcpxtq
npm run supabase -- migration list --linked
npm run supabase -- db push --linked --dry-run --skip-vault
npm run supabase -- db push --linked --skip-vault
```

The first deployment used the connected Supabase migration tool. Its generated
history versions were reconciled to `20261101000000` and `20261101010000` only
after verifying the stored statements matched the source files. The hosted
`supabase_migrations.schema_migrations` ledger now matches both local filenames.
The standalone Node runner uses a separate `app_private.schema_migrations`
ledger; do not use it to manage this hosted project.

To refresh frontend types after a schema change:

```powershell
npm exec -- supabase gen types typescript --linked --schema public |
  Set-Content -Encoding utf8 utils/supabase/database.types.ts
```

References: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[Auth profile mapping](https://supabase.com/docs/guides/auth/managing-user-data),
[row security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
