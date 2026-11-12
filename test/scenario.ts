import { expect } from 'vitest'
import { LogEntry } from '../src/index'
import { Category, Comment, Post, Tag } from './blog/models'
import type { AdminTestSetup } from './helpers'

/** An end-to-end walk through the admin, used to check every database backend. */
export async function adminScenario(s: AdminTestSetup): Promise<void> {
  await s.superuser()
  const cat = await Category.objects.create({ name: 'News' })
  const tag = await Tag.objects.create({ name: 'ts' })

  const index = await s.client.get('/admin/')
  expect(index.status).toBe(200)

  // add with M2M, FK, JSON, date and an inline row
  const add = await s.client.post('/admin/blog/post/add/', {
    form: {
      title: 'Hello Postgres',
      slug: 'hello',
      body: 'a b c',
      status: 'published',
      published: 'on',
      category: String(cat.pk),
      publisher: '',
      author: '',
      tags: [String(tag.pk)],
      createdAt: '2024-02-03T04:05',
      publishDate: '2024-02-04',
      metadata: '{"a": 1}',
      'comments-TOTAL_FORMS': '1',
      'comments-INITIAL_FORMS': '0',
      'comments-0-author': 'ann',
      'comments-0-text': 'first!',
    },
  })
  expect(add.status).toBe(302)
  const post = await Post.objects.get({ slug: 'hello' })
  expect(post.metadata).toEqual({ a: 1 })
  expect(await Comment.objects.filter({ postId: post.pk }).count()).toBe(1)
  expect(((await (post as any).tags.all()) as Tag[]).map((t) => t.name)).toEqual(['ts'])

  for (let i = 0; i < 6; i++) {
    await Post.objects.create({
      title: `Other ${i}`,
      slug: `o${i}`,
      createdAt: new Date(Date.UTC(2023, i, 1)),
    } as any)
  }

  // changelist: search, filters, sorting, pagination, date hierarchy
  const search = await (await s.client.get('/admin/blog/post/?q=postgres')).text()
  expect(search).toContain('Hello Postgres')
  expect(search).not.toContain('Other 1')
  const filtered = await (await s.client.get(`/admin/blog/post/?category__id__exact=${cat.pk}`)).text()
  expect(filtered).toContain('1 result')
  const sorted = await (await s.client.get('/admin/blog/post/?o=-1&all=')).text()
  expect(sorted.indexOf('Other 5')).toBeLessThan(sorted.indexOf('Other 0'))
  const page2 = await s.client.get('/admin/blog/post/?p=2')
  expect(page2.status).toBe(200)
  const years = await (await s.client.get('/admin/blog/post/')).text()
  expect(years).toContain('?createdAt__year=2023')
  expect(years).toContain('?createdAt__year=2024')
  const months = await (await s.client.get('/admin/blog/post/?createdAt__year=2023')).text()
  expect(months).toContain('June 2023')

  // change + history
  const change = await s.client.post(`/admin/blog/post/${post.pk}/change/`, {
    form: {
      title: 'Hello again',
      slug: 'hello',
      body: 'a b c',
      status: 'published',
      published: 'on',
      category: String(cat.pk),
      publisher: '',
      author: '',
      tags: [String(tag.pk)],
      createdAt: '2024-02-03T04:05',
      publishDate: '2024-02-04',
      metadata: '{"a": 1}',
      'comments-TOTAL_FORMS': '1',
      'comments-INITIAL_FORMS': '1',
      'comments-0-id': String((await Comment.objects.first())!.pk),
      'comments-0-author': 'ann',
      'comments-0-text': 'first!',
      'comments-0-DELETE': 'on',
    },
  })
  expect(change.status).toBe(302)
  expect(await Comment.objects.count()).toBe(0)
  const history = await (await s.client.get(`/admin/blog/post/${post.pk}/history/`)).text()
  expect(history).toContain('Changed Title.')
  expect(history).toContain('Deleted comment “Comment by ann”.')

  // bulk delete
  const others = (await Post.objects.filter({ title__startswith: 'Other' })) as Post[]
  const done = await s.client.post('/admin/blog/post/', {
    form: { action: 'delete_selected', post: 'yes', _selected_action: others.map((o) => String(o.pk)) },
  })
  expect(done.status).toBe(302)
  expect(await Post.objects.count()).toBe(1)
  expect(await LogEntry.objects.count()).toBeGreaterThanOrEqual(8)

  // autocomplete
  const ac = (await (
    await s.client.get('/admin/autocomplete/?app_label=blog&model_name=post&field_name=category&term=ne')
  ).json()) as any
  expect(ac.results).toEqual([{ id: String(cat.pk), text: 'News' }])
}
