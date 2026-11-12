import { User } from '@ghuri/auth'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Category, Comment, Post } from './blog/models'
import { type AdminTestSetup, setupAdmin } from './helpers'

let s: AdminTestSetup
beforeAll(async () => {
  s = await setupAdmin()
})
afterAll(async () => {
  await s?.db.teardown()
})

async function seed() {
  const news = await Category.objects.create({ name: 'News' })
  const tech = await Category.objects.create({ name: 'Tech' })
  const ann = await User.objects.createUser('ann', 'ann@example.com', 'x')
  const posts: Post[] = []
  for (let i = 0; i < 8; i++) {
    posts.push(
      await Post.objects.create({
        title: `Post ${i}`,
        slug: `slug-${i}`,
        categoryId: i % 2 ? news.pk : tech.pk,
        published: i < 3,
        status: i < 3 ? 'published' : 'draft',
        views: i * 40,
        authorId: i === 5 ? ann.pk : null,
        createdAt: new Date(Date.UTC(2023 + (i % 2), i, 10 + i)),
      } as any),
    )
  }
  return { news, tech, posts }
}

function titles(body: string): string[] {
  return [...body.matchAll(/<th class="field-title"><a href="[^"]+">([^<]+)<\/a><\/th>/g)].map((m) => m[1])
}

describe('changelist', () => {
  beforeEach(async () => {
    await s.flush()
    await s.superuser()
  })

  it('paginates with listPerPage and shows all', async () => {
    await seed()
    const p1 = await (await s.client.get('/admin/blog/post/')).text()
    expect(titles(p1)).toHaveLength(5)
    expect(p1).toContain('8 posts')
    expect(p1).toContain('href="?p=2"')
    expect(p1).toContain('Show all')
    const p2 = await (await s.client.get('/admin/blog/post/?p=2')).text()
    expect(titles(p2)).toHaveLength(3)
    const all = await (await s.client.get('/admin/blog/post/?all=')).text()
    expect(titles(all)).toHaveLength(8)
    const bad = await s.client.get('/admin/blog/post/?p=9')
    expect(bad.status).toBe(302)
    expect(bad.headers.get('location')).toBe('/admin/blog/post/?e=1')
  })

  it('searches with prefixes and related lookups', async () => {
    await seed()
    const q = await (await s.client.get('/admin/blog/post/?q=Post+3')).text()
    expect(titles(q)).toEqual(['Post 3'])
    expect(q).toContain('1 result')
    expect(q).toContain('8 total')
    expect(q).toContain('Search results for “Post 3”')
    const caret = await (await s.client.get('/admin/blog/post/?q=slug-7')).text()
    expect(titles(caret)).toEqual(['Post 7'])
    const noMatch = await (await s.client.get('/admin/blog/post/?q=lug-7')).text()
    expect(titles(noMatch)).toEqual([])
    const related = await (await s.client.get('/admin/blog/post/?q=ann')).text()
    expect(titles(related)).toEqual(['Post 5'])
  })

  it('filters with boolean, choices, related, date and simple filters', async () => {
    const { news } = await seed()
    const pub = await (await s.client.get('/admin/blog/post/?published__exact=1')).text()
    expect(titles(pub).sort()).toEqual(['Post 0', 'Post 1', 'Post 2'])
    expect(pub).toContain('Clear all filters')
    const status = await (await s.client.get('/admin/blog/post/?status__exact=draft&all=')).text()
    expect(titles(status)).toHaveLength(5)
    const cat = await (await s.client.get(`/admin/blog/post/?category__id__exact=${news.pk}`)).text()
    expect(titles(cat).sort()).toEqual(['Post 1', 'Post 3', 'Post 5', 'Post 7'])
    expect(cat).toMatch(/<li class="selected"><a href="[^"]*" aria-current="true">News<\/a><\/li>/)
    const popular = await (await s.client.get('/admin/blog/post/?popular=yes&all=')).text()
    expect(titles(popular).sort()).toEqual(['Post 3', 'Post 4', 'Post 5', 'Post 6', 'Post 7'])
    const dates = await (
      await s.client.get('/admin/blog/post/?createdAt__gte=2023-01-01&createdAt__lt=2024-01-01&all=')
    ).text()
    expect(titles(dates).sort()).toEqual(['Post 0', 'Post 2', 'Post 4', 'Post 6'])
    const local = await (await s.client.get('/admin/blog/post/?views__gte=200&all=')).text()
    expect(titles(local).sort()).toEqual(['Post 5', 'Post 6', 'Post 7'])
  })

  it('rejects disallowed related lookups', async () => {
    await seed()
    const res = await s.client.get('/admin/blog/post/?author__password__startswith=pbkdf2')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin/blog/post/?e=1')
    const err = await s.client.get('/admin/blog/post/?author__password__startswith=x&e=1')
    expect(await err.text()).toContain('Database error')
  })

  it('sorts by columns with multi-sort o= params', async () => {
    await seed()
    const asc = await (await s.client.get('/admin/blog/post/?o=1&all=')).text()
    expect(titles(asc)).toEqual([
      'Post 0',
      'Post 1',
      'Post 2',
      'Post 3',
      'Post 4',
      'Post 5',
      'Post 6',
      'Post 7',
    ])
    const desc = await (await s.client.get('/admin/blog/post/?o=-6&all=')).text()
    expect(titles(desc)[0]).toBe('Post 7')
    // callable column with display({ ordering })
    const shout = await (await s.client.get('/admin/blog/post/?o=-5&all=')).text()
    expect(titles(shout)[0]).toBe('Post 7')
    // multi-sort: published desc, then title asc
    const multi = await (await s.client.get('/admin/blog/post/?o=-3.1&all=')).text()
    expect(titles(multi)).toEqual([
      'Post 0',
      'Post 1',
      'Post 2',
      'Post 3',
      'Post 4',
      'Post 5',
      'Post 6',
      'Post 7',
    ])
    expect(multi).toContain('class="column-published sortable sorted descending"')
    expect(multi).toContain('<span class="sortpriority" title="Sorting priority: 2">2</span>')
    expect(multi).toContain('href="?o=3.1&amp;all="')
  })

  it('drills down the date hierarchy', async () => {
    await seed()
    const top = await (await s.client.get('/admin/blog/post/')).text()
    expect(top).toContain('href="?createdAt__year=2023"')
    expect(top).toContain('href="?createdAt__year=2024"')
    const year = await (await s.client.get('/admin/blog/post/?createdAt__year=2023&all=')).text()
    expect(titles(year).sort()).toEqual(['Post 0', 'Post 2', 'Post 4', 'Post 6'])
    expect(year).toContain('All dates')
    expect(year).toContain('January 2023')
    expect(year).toContain('href="?all=&amp;createdAt__year=2023&amp;createdAt__month=3"')
    const month = await (
      await s.client.get('/admin/blog/post/?createdAt__year=2023&createdAt__month=3')
    ).text()
    expect(titles(month)).toEqual(['Post 2'])
    expect(month).toContain('March 12')
    const day = await (
      await s.client.get('/admin/blog/post/?createdAt__year=2023&createdAt__month=3&createdAt__day=12')
    ).text()
    expect(titles(day)).toEqual(['Post 2'])
    expect(day).toContain('March 2023')
  })

  it('escapes object names', async () => {
    await Post.objects.create({ title: '<script>alert("x")</script>', slug: 'xss' })
    const body = await (await s.client.get('/admin/blog/post/')).text()
    expect(body).not.toContain('<script>alert')
    expect(body).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
  })

  it('saves listEditable fields', async () => {
    const p = await Post.objects.create({ title: 'P', slug: 'p' })
    const c1 = await Comment.objects.create({ postId: p.pk, author: 'a', text: 't' } as any)
    const c2 = await Comment.objects.create({ postId: p.pk, author: 'b', text: 't' } as any)
    const page = await (await s.client.get('/admin/blog/comment/')).text()
    expect(page).toContain('name="form-TOTAL_FORMS"')
    expect(page).toContain('name="form-0-approved"')
    expect(page).toContain('name="_save"')
    const rows = [...page.matchAll(/name="form-(\d)-id" value="(\d+)"/g)].map((m) => [m[1], m[2]])
    const form: Record<string, string> = {
      'form-TOTAL_FORMS': '2',
      'form-INITIAL_FORMS': '2',
      _save: 'Save',
    }
    for (const [i, pk] of rows) {
      form[`form-${i}-id`] = pk
      if (pk === String(c2.pk)) form[`form-${i}-approved`] = 'on'
    }
    const res = await s.client.post('/admin/blog/comment/', { form })
    expect(res.status).toBe(302)
    expect((await Comment.objects.get({ pk: c1.pk })).approved).toBe(false)
    expect((await Comment.objects.get({ pk: c2.pk })).approved).toBe(true)
    const after = await (await s.client.get('/admin/blog/comment/')).text()
    expect(after).toContain('1 comment was changed successfully.')
  })

  it('preserves filters through the change form', async () => {
    const { posts } = await seed()
    const list = await (await s.client.get('/admin/blog/post/?published__exact=1')).text()
    const link = `/admin/blog/post/${posts[0].pk}/change/?_changelist_filters=published__exact%3D1`
    expect(list).toContain(link.replace(/&/g, '&amp;'))
    const res = await s.client.get(link)
    const body = await res.text()
    expect(body).toContain(`action="${link}"`)
  })
})
