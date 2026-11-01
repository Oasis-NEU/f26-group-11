import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

test('KhouryConnect PostgreSQL relationships and constraints', async t => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL; run npm run db:migrate first.');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('begin');
  // Explicit negative identity IDs avoid advancing real application sequences.
  const base = -Math.floor(Math.random() * 1_000_000_000) - 10;
  const tag = randomUUID();
  const user = randomUUID();
  const prof = `test-${tag}`;
  async function rejects(sql, values, code) {
    await client.query('savepoint expected_failure');
    try {
      await assert.rejects(() => client.query(sql, values), { code });
    } finally {
      await client.query('rollback to savepoint expected_failure');
      await client.query('release savepoint expected_failure');
    }
  }
  try {
    await client.query('insert into public.users (user_id, email, display_name, bio, avatar_url) values ($1, $2, $3, $4, $5)',
      [user, `${tag}@example.test`, 'Test student', 'Likes databases', 'https://example.test/avatar.png']);
    await client.query('insert into public.professors (prof_id, first_name) values ($1, $2)', [prof, 'Test professor']);
    for (const id of [base, base - 1]) {
      await client.query('insert into public.communities (community_id, course_code, course_name, slug) values ($1, $2, $3, $4)',
        [id, `TEST${id}`, 'Test course', `test-${tag}-${-id}`]);
      await client.query('insert into public.posts (post_id, author_id, community_id, title, content) values ($1, $2, $3, $4, $5)',
        [id, user, id, 'Question', 'How does this course work?']);
    }

    await t.test('all 11 app tables exist with row security enabled', async () => {
      const { rows } = await client.query(`select relname, relrowsecurity from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname = any($1::text[])`, [[
        'users', 'communities', 'posts', 'post_votes', 'community_members',
        'community_posts', 'professors', 'community_profs', 'comments', 'course_offerings', 'enrollments',
      ]]);
      assert.equal(rows.length, 11);
      assert.ok(rows.every(row => row.relrowsecurity));
      const password = await client.query(`select column_name from information_schema.columns
        where table_schema = 'public' and column_name in ('pwd', 'password')`);
      assert.equal(password.rowCount, 0);
    });

    await t.test('duplicate emails and malformed slugs are rejected', async () => {
      await rejects('insert into public.users (email) values ($1)', [`${tag.toUpperCase()}@EXAMPLE.TEST`], '23505');
      await rejects('insert into public.communities (community_id, course_code, course_name, slug) values ($1, $2, $3, $4)',
        [base - 2, `TEST${base - 2}`, 'Test', 'Has Spaces'], '23514');
    });

    await t.test('enrollment resolves the student, course, professor, term, and section', async () => {
      await client.query(`insert into public.course_offerings (offering_id, community_id, prof_id, term, section)
        values ($1, $2, $3, $4, $5)`, [base, base, prof, 'Spring 2027', '02']);
      await client.query('insert into public.enrollments (enrollment_id, user_id, offering_id) values ($1, $2, $3)', [base, user, base]);
      const { rows } = await client.query(`select u.display_name, c.course_code, p.first_name, o.term, o.section
        from public.enrollments e join public.users u using (user_id)
        join public.course_offerings o using (offering_id)
        join public.communities c using (community_id)
        join public.professors p using (prof_id)
        where e.enrollment_id = $1`, [base]);
      assert.deepEqual(rows[0], { display_name: 'Test student', course_code: `TEST${base}`,
        first_name: 'Test professor', term: 'Spring 2027', section: '02' });
      await rejects('insert into public.enrollments (enrollment_id, user_id, offering_id) values ($1, $2, $3)',
        [base - 1, user, base], '23505');
      await rejects(`insert into public.course_offerings (offering_id, community_id, prof_id, term, section)
        values ($1, $2, $3, $4, $5)`, [base - 1, base, prof, 'Spring 2027', '02'], '23505');
      await rejects('insert into public.enrollments (enrollment_id, user_id, offering_id) values ($1, $2, $3)',
        [base - 1, user, base - 999], '23503');
    });

    await t.test('membership and votes cannot be duplicated', async () => {
      await client.query('insert into public.community_members (membership_id, user_id, community_id) values ($1, $2, $3)', [base, user, base]);
      await rejects('insert into public.community_members (membership_id, user_id, community_id) values ($1, $2, $3)',
        [base - 1, user, base], '23505');
      await client.query('insert into public.post_votes (vote_id, user_id, post_id) values ($1, $2, $3)', [base, user, base]);
      await rejects('insert into public.post_votes (vote_id, user_id, post_id) values ($1, $2, $3)',
        [base - 1, user, base], '23505');
    });

    await t.test('community_posts cannot contradict the post community', async () => {
      await client.query('insert into public.community_posts (community_post_id, post_id, community_id) values ($1, $2, $3)', [base, base, base]);
      await rejects('insert into public.community_posts (community_post_id, post_id, community_id) values ($1, $2, $3)',
        [base - 1, base, base - 1], '23503');
    });

    await t.test('threaded replies enforce the same post, reject cycles, and stamp edits', async () => {
      await client.query(`insert into public.comments (comment_id, post_id, author_id, content, updated_at)
        values ($1, $2, $3, $4, '2000-01-01')`, [base, base, user, 'Parent']);
      await client.query(`insert into public.comments (comment_id, post_id, author_id, parent_comment_id, content)
        values ($1, $2, $3, $4, $5)`, [base - 1, base, user, base, 'Reply']);
      await rejects(`insert into public.comments (comment_id, post_id, author_id, parent_comment_id, content)
        values ($1, $2, $3, $4, $5)`, [base - 2, base - 1, user, base, 'Wrong post'], '23503');
      await rejects(`insert into public.comments (comment_id, post_id, author_id, parent_comment_id, content)
        values ($1, $2, $3, $4, $5)`, [base - 2, base, user, base - 2, 'Self reply'], '23514');
      await rejects('update public.comments set parent_comment_id = $1 where comment_id = $2', [base - 1, base], '23514');
      await rejects('update public.comments set post_id = $1 where comment_id = $2', [base - 1, base], '23514');
      const { rows } = await client.query(`update public.comments set content = 'Edited parent'
        where comment_id = $1 returning updated_at`, [base]);
      assert.ok(rows[0].updated_at > new Date('2000-01-01'));
    });

    await t.test('deleting a post removes its comments, votes, and community link', async () => {
      await client.query('delete from public.posts where post_id = $1', [base]);
      for (const table of ['comments', 'post_votes', 'community_posts']) {
        const { rows } = await client.query(`select count(*)::int as count from public.${table} where post_id = $1`, [base]);
        assert.equal(rows[0].count, 0);
      }
    });
  } finally {
    // Test fixtures are never committed, even when an assertion fails.
    await client.query('rollback');
    await client.end();
  }
});
