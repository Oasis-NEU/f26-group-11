# KhouryConnect API

FastAPI reads the same PostgreSQL schema used by Supabase. Supabase provides
the database, Auth, and generated `/rest/v1` database API. This Python application
runs as a separate service; creating a Supabase project does not deploy FastAPI.

## Run

Use Python 3.12+ from the `api` directory:

```powershell
uv venv .venv --python 3.12
uv pip install --python .venv/Scripts/python.exe -r requirements-dev.txt
Copy-Item .env.example .env
# Set the repository backend, connection, and Auth settings in .env.
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Choose one explicit repository backend; connection failures never switch backends:

- `REPOSITORY_BACKEND=supabase`: Set `SUPABASE_URL` and
  `SUPABASE_PUBLISHABLE_KEY`. Reads use Supabase's generated Data API and its RLS
  policies. Community reads use the publishable key; `/me` forwards the verified
  request's bearer token for profile access. No database password is required.
- `REPOSITORY_BACKEND=postgres` (default): Set the server-only `DATABASE_URL`.
  Repositories issue parameterized SQL queries directly to PostgreSQL. Set
  Supabase URL/key as well to use bearer authentication.

Settings load the repository root `.env.db`, then `api/.env`. Process environment
variables override both. For the existing local database, keep the root `.env.db`
connection URL and remove the example `DATABASE_URL` line from `api/.env`.
For direct SQL to Supabase use the connection string from its Connect panel, with TLS
enabled (`sslmode=require`). Use its session pooler if IPv4 is needed. Direct
connections and transaction pooling are also supported; prepared statements are
disabled. `DATABASE_URL` is a server secret and must never use a `NEXT_PUBLIC_`
prefix. A publishable key or legacy anon key is sufficient for Auth validation;
the API does not require a Supabase service-role key.

Run production with `APP_ENV=prod` and configured CORS origins. In direct SQL mode,
use a dedicated server-side database connection. The routes only select data; a database
role with SELECT on `public.communities` and `public.users` is sufficient if its
RLS permissions allow those reads. An owner/BYPASSRLS connection is trusted backend
access: the API verifies the Auth identity and selects only that user's profile.
Never expose that connection string to browser clients.

## Routes

All routes have the `/api/v1` prefix. Interactive documentation is at `/docs`.

| Route | Success | Other behavior |
| --- | --- | --- |
| `GET /api/v1/health` | `200 {"status":"ok"}` | Liveness only; does not query PostgreSQL. |
| `GET /api/v1/communities` | `200` array of community rows, ordered by ID | Empty database returns `[]`; database unavailable returns `503`. |
| `GET /api/v1/communities/{slug}` | `200` community row | Missing slug returns `404`; database unavailable returns `503`. |
| `GET /api/v1/me` | `200` own profile | Missing/invalid credentials return `401`; verified user without a profile returns `404`; Auth/database unavailable returns `503`. |

The community routes are public, matching the existing scaffold. Profile email and
academic details are only returned by `/me` to that authenticated user.

Authenticate `/me` using `Authorization: Bearer <Supabase access_token>`. The API
checks the token with the configured project's `/auth/v1/user` endpoint and uses
the verified `id` to query `public.users.user_id`. It does not trust unverified JWT
claims. The hosted migration provisions this matching profile when an Auth user is
created. A failed Auth request never falls back to development impersonation.

For explicit local testing with `REPOSITORY_BACKEND=postgres`, set
`DEV_AUTH_ENABLED=true` with `APP_ENV=dev` and send
`X-Dev-User: <existing public.users.user_id>`. This switch defaults to false and
the header is always ignored in production, including when malformed.

## Schema compatibility changes

The original samples did not match the migrated Airtable schema:

- Communities now use integer `community_id`, `course_code`, `course_name`,
  `slug`, nullable `description`, and `created_at`. The old UUID, `name`, and
  nonexistent `course_id` contract was removed.
- Users now use UUID `user_id` and nullable profile fields. The old `id` and
  required global `role` were removed; membership roles belong to
  `community_members` and do not define a global user role. The legacy internal
  `comments_schema_note` field is not part of the profile response.
- Runtime dependencies now use PostgreSQL or Supabase Data API repositories. Fake repositories exist
  only for isolated tests; their profile keys and slug lookup have been corrected.

## Verify

```powershell
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check app tests
$env:RUN_DATABASE_TESTS='1'
.venv/Scripts/python.exe -m pytest -q
```

`RUN_DATABASE_TESTS=1` enables integration tests against the migrated local
PostgreSQL database from `DATABASE_URL` (including root `.env.db`). Run these
against a development database. Fixtures and repository queries share a rolled
back transaction and use explicit negative community IDs, so application records
and identity sequences are unchanged. Supabase Auth HTTP responses are simulated
in these tests; live hosted Auth and `/rest/v1` checks are separate deployment
verification.

Official references: [PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[server-side user verification](https://supabase.com/docs/reference/python/auth-getuser).
