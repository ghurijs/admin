import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LogEntry } from '../src/index'
import { Comment, Post } from './blog/models'
import { type AdminTestSetup, setupAdmin } from './helpers'

let s: AdminTestSetup
beforeAll(async () => {
  s = await setupAdmin()
})
afterAll(async () => {
  await s?.db.teardown()
})
beforeEach(async () => {
  await s.flush()
  await s.superuser()
})

async function posts(n: number): Promise<Post[]> {
  const out: Post[] = []
  for (let i = 0; i < n; i++) out.push(await Post.objects.create({ title: `P${i}`, slug: `p${i}` }))
  return out
}

describe('actions', () => {
  it('lists site-wide and custom actions', async () => {
    await posts(1)
    const body = await (await s.client.get('/admin/blog/post/')).text()
    expect(body).toContain('<option value="delete_selected">Delete selected posts</option>')
    expect(body).toContain('<option value="make_published">Mark selected posts as published</option>')
    expect(body).toContain('<option value="markDraft">Mark as draft</option>')
    expect(body).toContain('name="_selected_action"')
    expect(body).toContain('id="action-toggle"')
  })

  it('runs a function action on the selected objects', async () => {
    const [a, b, c] = await posts(3)
    const res = await s.client.post('/admin/blog/post/?q=P', {
      form: { action: 'make_published', index: '0', _selected_action: [String(a.pk), String(c.pk)] },
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin/blog/post/?q=P')
    expect((await Post.objects.get({ pk: a.pk })).published).toBe(true)
    expect((await Post.objects.get({ pk: b.pk })).published).toBe(false)
    expect((await Post.objects.get({ pk: c.pk })).status).toBe('published')
    const page = await (await s.client.get('/admin/blog/post/')).text()
    expect(page).toContain('2 posts were marked as published.')
  })

  it('runs a method action and supports select_across', async () => {
    await Post.objects.create({ title: 'x', slug: 'x', published: true, status: 'published' })
    await Post.objects.create({ title: 'y', slug: 'y', published: true, status: 'published' })
    await s.client.post('/admin/blog/post/', {
      form: { action: 'markDraft', index: '0', select_across: '1' },
    })
    expect(await Post.objects.filter({ status: 'draft' }).count()).toBe(2)
    expect(await (await s.client.get('/admin/blog/post/')).text()).toContain('2 marked as draft.')
  })

  it('warns when nothing is selected or no action is chosen', async () => {
    await posts(1)
    await s.client.post('/admin/blog/post/', { form: { action: 'make_published', index: '0' } })
    expect(await (await s.client.get('/admin/blog/post/')).text()).toContain(
      'Items must be selected in order to perform actions on them. No items have been changed.',
    )
    const [p] = await Post.objects.all().slice(0, 1)
    await s.client.post('/admin/blog/post/', {
      form: { action: '', index: '0', _selected_action: String(p.pk) },
    })
    expect(await (await s.client.get('/admin/blog/post/')).text()).toContain('No action selected.')
  })

  it('confirms and performs the bulk delete', async () => {
    const [a, b, c] = await posts(3)
    await Comment.objects.create({ postId: a.pk, author: 'z', text: 'z' } as any)
    const confirm = await s.client.post('/admin/blog/post/', {
      form: { action: 'delete_selected', index: '0', _selected_action: [String(a.pk), String(b.pk)] },
    })
    expect(confirm.status).toBe(200)
    const body = await confirm.text()
    expect(body).toContain('Are you sure you want to delete the selected posts?')
    expect(body).toContain('<li>Posts: 2</li>')
    expect(body).toContain('<li>Comments: 1</li>')
    expect(body).toContain('name="action" value="delete_selected"')
    expect(body).toContain(`name="_selected_action" value="${a.pk}"`)
    expect(await Post.objects.count()).toBe(3)
    const done = await s.client.post('/admin/blog/post/', {
      form: { action: 'delete_selected', post: 'yes', _selected_action: [String(a.pk), String(b.pk)] },
    })
    expect(done.status).toBe(302)
    expect((await Post.objects.all()).map((p) => p.pk)).toEqual([c.pk])
    expect(await Comment.objects.count()).toBe(0)
    expect(await LogEntry.objects.filter({ actionFlag: 3 }).count()).toBe(2)
    expect(await (await s.client.get('/admin/blog/post/')).text()).toContain('Successfully deleted 2 posts.')
  })

  it('refuses the bulk delete without delete permission on related objects', async () => {
    const [a] = await posts(1)
    await Comment.objects.create({ postId: a.pk, author: 'z', text: 'z' } as any)
    s.client.clearCookies()
    await s.staff(['blog.view_post', 'blog.delete_post'])
    const res = await s.client.post('/admin/blog/post/', {
      form: { action: 'delete_selected', index: '0', _selected_action: [String(a.pk)] },
    })
    const body = await res.text()
    expect(body).toContain('Cannot delete post')
    expect(body).toContain('your account doesn’t have permission to delete the following types of objects')
    expect(body).toContain('<li>comment</li>')
    await s.client.post('/admin/blog/post/', {
      form: { action: 'delete_selected', post: 'yes', _selected_action: [String(a.pk)] },
    })
    expect(await Post.objects.count()).toBe(1)
  })
})
