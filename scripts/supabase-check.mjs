import assert from 'node:assert/strict';

// Read-only checks against the actual hosted Data API; never seed production.
const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!rawUrl || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or the NEXT_PUBLIC_ equivalents).');
  process.exitCode = 1;
} else {
  try {
    const url = new URL(rawUrl);
    assert.equal(url.protocol, 'https:', 'Hosted Supabase checks require HTTPS.');
    const headers = { apikey: key };
    async function request(path) {
      return fetch(new URL(path, url), { headers, signal: AbortSignal.timeout(15000) });
    }
    const communities = await request('/rest/v1/communities?select=community_id,course_code,course_name,slug,description,created_at&order=community_id&limit=1');
    assert.equal(communities.status, 200, 'Community schema/public SELECT check failed.');
    assert.ok(Array.isArray(await communities.json()), 'Communities must return an array.');
    console.log('PASS: hosted community columns and anonymous reads');

    for (const table of ['users', 'posts', 'post_votes', 'community_members', 'community_posts',
      'professors', 'community_profs', 'comments', 'course_offerings', 'enrollments']) {
      const response = await request(`/rest/v1/${table}?select=*&limit=0`);
      assert.ok([401, 403].includes(response.status), `Anonymous access unexpectedly allowed: ${table}`);
      console.log(`PASS: anonymous ${table} reads denied`);
    }

    const invalidAuth = await fetch(new URL('/auth/v1/user', url), {
      headers: { ...headers, Authorization: 'Bearer invalid-smoke-test-token' },
      signal: AbortSignal.timeout(15000),
    });
    assert.ok([401, 403].includes(invalidAuth.status), 'Invalid Auth token was not rejected.');
    console.log('PASS: invalid Supabase Auth token rejected');
  } catch (error) {
    // Do not print response bodies, request headers, or configuration values.
    console.error(`Supabase verification failed: ${error instanceof assert.AssertionError ? error.message : 'request/configuration error'}`);
    process.exitCode = 1;
  }
}
