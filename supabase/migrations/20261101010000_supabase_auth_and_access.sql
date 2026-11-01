-- requires: supabase-auth
-- Apply after the Airtable schema, in a Supabase project with Auth enabled.
-- The standalone PostgreSQL runner skips this file without recording it.
do $$
begin
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'This migration requires Supabase Auth (auth.users and auth.uid()).';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'This migration requires the Supabase anon and authenticated roles.';
  end if;
  if exists (
    select 1 from public.users p
    where not exists (select 1 from auth.users a where a.id = p.user_id)
  ) then
    raise exception 'Existing profiles must be explicitly mapped to auth.users.id before deployment.';
  end if;
end;
$$;

-- Profiles share the Auth identity. Deliberate RESTRICT preserves the existing
-- data-retention behavior: account deletion requires an explicit profile/content
-- cleanup decision, rather than silently deleting authored posts or comments.
alter table public.users add constraint users_auth_identity_fkey
  foreign key (user_id) references auth.users(id) on delete restrict;

create function app_private.sync_auth_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- KhouryConnect uses email identities. Phone-only/anonymous Auth identities
  -- acquire a profile if they later add an email. Never fabricate an address.
  if new.email is null or btrim(new.email) = '' then
    if exists (select 1 from public.users where user_id = new.id) then
      raise exception 'A KhouryConnect profile requires an email address'
        using errcode = '23514';
    end if;
    return new;
  end if;

  insert into public.users (
    user_id, email, first_name, last_name, display_name, avatar_url
  ) values (
    new.id, new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'avatar_url'
  ) on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function app_private.sync_auth_user_profile() from public, anon, authenticated;

create trigger khouryconnect_sync_auth_profile
  after insert or update of email on auth.users
  for each row execute function app_private.sync_auth_user_profile();

-- Existing Auth accounts need the same mapping as future signups. A conflicting
-- email belonging to another UUID fails instead of taking over that profile.
insert into public.users (
  user_id, email, first_name, last_name, display_name, avatar_url
)
select id, email,
  raw_user_meta_data ->> 'first_name', raw_user_meta_data ->> 'last_name',
  raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'avatar_url'
from auth.users
where email is not null and btrim(email) <> ''
on conflict (user_id) do update set email = excluded.email;

-- Some Supabase projects have broad default table/sequence grants. Reset grants
-- only on these application objects, then allow the sample endpoints' access.
revoke all on table
  public.users, public.communities, public.posts, public.post_votes,
  public.community_members, public.community_posts, public.professors,
  public.community_profs, public.comments, public.course_offerings,
  public.enrollments
from public, anon, authenticated;
revoke all on sequence
  public.communities_community_id_seq, public.posts_post_id_seq,
  public.post_votes_vote_id_seq, public.community_members_membership_id_seq,
  public.community_posts_community_post_id_seq, public.community_profs_community_prof_id_seq,
  public.comments_comment_id_seq, public.course_offerings_offering_id_seq,
  public.enrollments_enrollment_id_seq
from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on public.communities to anon, authenticated;
create policy communities_public_read on public.communities
  for select to anon, authenticated using (true);

grant select on public.users to authenticated;
grant update (first_name, last_name, year, major, minor, display_name, bio, avatar_url)
  on public.users to authenticated;
create policy users_read_own_profile on public.users
  for select to authenticated using ((select auth.uid()) = user_id);
create policy users_update_own_profile on public.users
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The other nine tables retain RLS with no API grants/policies. No content-write
-- permission or global role is inferred from untrusted signup metadata.
