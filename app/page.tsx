import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

async function CommunityList() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: communities, error } = await supabase
    .from('communities')
    .select('community_id, course_code, course_name, slug, description')
    .order('course_code')

  return (
    <>
      {error ? (
        <p>Communities are unavailable right now. Please try again later.</p>
      ) : communities?.length ? (
        <ul>
          {communities.map((community) => (
            <li key={community.community_id}>
              <h3>{community.course_code}: {community.course_name}</h3>
              {community.description && <p>{community.description}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p>No communities have been added yet.</p>
      )}
    </>
  )
}

export default function Page() {
  return (
    <main>
      <h1>KhouryConnect</h1>
      <h2>Communities</h2>
      <Suspense fallback={<p>Loading communities...</p>}>
        <CommunityList />
      </Suspense>
    </main>
  )
}
