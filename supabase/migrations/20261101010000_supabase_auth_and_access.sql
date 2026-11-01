-- requires: supabase-auth
-- Apply after the Airtable schema, in a Supabase project with Auth enabled.
-- The standalone PostgreSQL runner skips this file without recording it.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'This migration requires Supabase Auth (auth.users and auth.uid()).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'This migration requires the Supabase anon and authenticated roles.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users p
    WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p.user_id)
  ) THEN
    RAISE EXCEPTION 'Existing profiles must be explicitly mapped to auth.users.id before deployment.';
  END IF;
END;
$$;

-- Profiles share the Auth identity. Deliberate RESTRICT preserves the existing
-- data-retention behavior: account deletion requires an explicit profile/content
-- cleanup decision, rather than silently deleting authored posts or comments.
ALTER TABLE public.users ADD CONSTRAINT users_auth_identity_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE FUNCTION app_private.sync_auth_user_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- KhouryConnect uses email identities. Phone-only/anonymous Auth identities
  -- acquire a profile if they later add an email. Never fabricate an address.
  IF new.email IS NULL OR btrim(new.email) = '' THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE user_id = new.id) THEN
      RAISE EXCEPTION 'A KhouryConnect profile requires an email address'
        USING ERRCODE = '23514';
    END IF;
    RETURN new;
  END IF;

  INSERT INTO public.users (
    user_id, email, first_name, last_name, display_name, avatar_url
  ) VALUES (
    new.id, new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'avatar_url'
  ) ON CONFLICT (user_id) DO UPDATE SET email = excluded.email;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION app_private.sync_auth_user_profile() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER khouryconnect_sync_auth_profile
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_auth_user_profile();

-- Existing Auth accounts need the same mapping as future signups. A conflicting
-- email belonging to another UUID fails instead of taking over that profile.
INSERT INTO public.users (
  user_id, email, first_name, last_name, display_name, avatar_url
)
SELECT id, email,
  raw_user_meta_data ->> 'first_name', raw_user_meta_data ->> 'last_name',
  raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'avatar_url'
FROM auth.users
WHERE email IS NOT NULL AND btrim(email) <> ''
ON CONFLICT (user_id) DO UPDATE SET email = excluded.email;

-- Some Supabase projects have broad default table/sequence grants. Reset grants
-- only on these application objects, then allow the sample endpoints' access.
REVOKE ALL ON TABLE
  public.users, public.communities, public.posts, public.post_votes,
  public.community_members, public.community_posts, public.professors,
  public.community_profs, public.comments, public.course_offerings,
  public.enrollments
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE
  public.communities_community_id_seq, public.posts_post_id_seq,
  public.post_votes_vote_id_seq, public.community_members_membership_id_seq,
  public.community_posts_community_post_id_seq, public.community_profs_community_prof_id_seq,
  public.comments_comment_id_seq, public.course_offerings_offering_id_seq,
  public.enrollments_enrollment_id_seq
FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.communities TO anon, authenticated;
CREATE POLICY communities_public_read ON public.communities
  FOR SELECT TO anon, authenticated USING (TRUE);

GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE (first_name, last_name, year, major, minor, display_name, bio, avatar_url)
  ON public.users TO authenticated;
CREATE POLICY users_read_own_profile ON public.users
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY users_update_own_profile ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- The other nine tables retain RLS with no API grants/policies. No content-write
-- permission or global role is inferred from untrusted signup metadata.
