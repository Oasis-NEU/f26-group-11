# KhouryConnect database

The PostgreSQL migration is in `supabase/migrations/20261101000000_create_khouryconnect.sql`.
It uses standard PostgreSQL 17+ SQL and does not depend on a hosted Supabase project.

## Airtable migration

Source: [KhouryConnect](https://airtable.com/appB9HVYaztkZkZuK), inspected November 1, 2026.
All **11 tables had zero records**, so no row import or ID remapping was necessary.
`docs/airtable-schema.json` captures the source field names, types, and counts.
Airtable is unchanged; future changes there are not synchronized automatically.

| Table | PostgreSQL representation |
| --- | --- |
| users | UUID key, email, name, academic details, display_name, bio, avatar_url |
| communities | Identity key, unique course code and slug, course name, description, created_at |
| posts | Identity key, author_id, community_id, title, content, created_at |
| post_votes | One vote record per user/post pair, created_at, updated_at |
| community_members | Unique user/community pair, existing role field and joined_at |
| community_posts | Original join table, dates, constrained to match posts.community_id |
| professors | Text prof_id, email, names |
| community_profs | Unique community/professor pair |
| comments | Post, author, optional parent, content, created_at, updated_at |
| course_offerings | Community, professor, term, section; unique community/term/section |
| enrollments | Unique user/offering pair |

Translation decisions:

- `createdAt` / `updatedAt` become `created_at` / `updated_at`; `posts.author` becomes
  `author_id`, and `posts.community` becomes `community_id`.
- Airtable links become scalar foreign keys. Automatically generated reverse links
  (such as users.posts and comments.replies) are queried through joins rather than stored twice.
  The separate users.joined list is represented by community_members.
- The source's `pwd` fields were explicitly empty placeholders. They are omitted.
  Authentication will be configured with Supabase later; no local password system is implemented.
- Users retain UUID keys. Professor IDs remain text, as in the Airtable base.
  Other IDs are bigint identities. IDs may be supplied explicitly for future imports.
- `year`, `term`, and the existing membership `role` remain text; the source did not
  define enum choices. Section is text to preserve leading zeroes such as `02`.
- Email uniqueness is case insensitive; course-code uniqueness is case insensitive.
  Slugs must be unique lowercase URL-friendly strings. Names and profile fields are optional.
- No downvote field was added: as in Airtable, a post_votes row means a vote exists.
- `community_posts`, `community_profs`, and the legacy comments_schema_note are preserved.
  posts.community_id is authoritative; community_posts cannot associate a post with
  a different community. No automatic duplicate community_posts row is required.
- A reply's parent must exist on the same post. Its parent/post cannot be changed
  after insertion, preventing cycles. Comment content can still be edited.
- Deleting a post cascades to its comments (including replies), votes, and join rows.
  Deleting a parent comment deletes its replies. Deleting an author with posts/comments
  is restricted, as is deleting a community/professor referenced by course content.
- No moderation tables or new moderation features were added.

## Run locally with Docker

Requirements: Node.js 24+, npm, and a running Docker Desktop Linux engine.

```powershell
npm ci
Copy-Item .env.db.example .env.db
# Edit .env.db: set a password and use it in DATABASE_URL too.
npm run db:up
npm run db:migrate
npm run db:test
npm run db:status
```

The database listens on **127.0.0.1:5433**, database `khouryconnect`, user `postgres`.
The password and connection URL are stored only in the ignored `.env.db` file.
You can connect with any PostgreSQL client using that file's DATABASE_URL.
`npm run db:down` stops the container while retaining data in the Docker volume.
Do not delete the volume unless you intend to erase the local database.

For an existing PostgreSQL 17+ server, set DATABASE_URL to a dedicated empty database
and run db:migrate without db:up. An environment variable overrides `.env.db`.
DATABASE_URL is a server secret; never give it a NEXT_PUBLIC_ prefix.

## Windows fallback without Docker

Docker Desktop failed to start on this machine, so a native PostgreSQL 17 instance
is used for the initial migration. Its runtime and data live in the ignored `.local/`
directory; credentials live in the ignored `.env.db`. It uses the same localhost
port and database name as the Docker configuration. Run only one backend at a time:
Docker and native PostgreSQL have separate data storage.

```powershell
npm run db:native:up
npm run db:migrate
npm run db:test
npm run db:status
# To stop while preserving the native database:
npm run db:native:down
```

The native launcher creates `.env.db` with a random local password if it does not
exist. It initializes the cluster only once, uses password authentication, and binds
only to 127.0.0.1. The server is not installed as a Windows service; restart it using
db:native:up after a reboot. Do not delete `.local/postgres-data` unless you intend
to erase the native database.

On a fresh Windows checkout, install the pinned binary runtime first:

```powershell
New-Item -ItemType Directory -Path .local/postgres-runtime -Force | Out-Null
npm pack @embedded-postgres/windows-x64@17.11.0-beta.19 --pack-destination .local --ignore-scripts --silent
tar -xzf .local/embedded-postgres-windows-x64-17.11.0-beta.19.tgz -C .local/postgres-runtime --strip-components=1
npm run db:native:up
```

The runtime comes from the [embedded-postgres project](https://github.com/leinelissen/embedded-postgres).
Its package license remains alongside the downloaded binaries; they are not committed.

## Migrations and verification

The runner applies each SQL file in a transaction, tracks checksums in
app_private.schema_migrations, and serializes concurrent runs with an advisory lock.
Rerunning db:migrate skips applied files. Add a new timestamped migration for changes;
do not edit an already-applied migration. No destructive reset command is provided.

db:test exercises the schema against a real PostgreSQL server: enrollment joins,
duplicate rejection, invalid foreign keys, threaded comments, edit timestamps,
post deletion cascades, and the absence of password columns. All fixtures roll back.
db:status reports migration history and counts for the 11 application tables.

## Supabase next

SQL files already use the Supabase migration directory and naming convention.
On a **new hosted project**, initialize/link the CLI project and apply these files
using the Supabase CLI; let its migration system manage hosted history. The local
Node runner's private ledger is only for the standalone PostgreSQL workflow.
See [Supabase's migration guide](https://supabase.com/docs/guides/deployment/database-migrations).

All application tables have row-level security enabled with no API access policies
yet. Local owner connections work, but browser/API roles cannot read or write rows.
Before connecting the frontend, add Supabase Auth integration (including mapping
users.user_id to auth.users.id), signup/profile creation, and the intended access policies.
These are authentication/access rules, independent of moderation functionality.
See [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

The Next.js UI and existing Supabase client helpers have not been wired to this local
database. No hosted Supabase resources were created during this migration.
