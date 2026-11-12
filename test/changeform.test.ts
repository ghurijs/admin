import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LogEntry } from '../src/index'
import { Attachment, Category, Comment, Post, Publisher, Tag } from './blog/models'
import { type AdminTestSetup, media, setupAdmin } from './helpers'

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

/** A complete, valid POST body for the post form (with an empty comments formset). */
function postForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Hello world',
    slug: 'hello-world',
    body: 'Some text here',
    status: 'draft',
    category: '',
    publisher: '',
    author: '',
    createdAt: '2024-05-01T10:30',
    publishDate: '',
    metadata: '',
    'comments-TOTAL_FORMS': '0',
    'comments-INITIAL_FORMS': '0',
    'comments-MIN_NUM_FORMS': '0',
    'comments-MAX_NUM_FORMS': '1000',
    ...overrides,
  }
}

describe('add / change', () => {
  it('renders the add form with fieldsets, widgets, prepopulated slug and inline', async () => {
    const res = await s.client.get('/admin/blog/post/add/?title=Prefilled')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<h1>Add post</h1>')
    expect(body).toContain('value="Prefilled"')
    expect(body).toContain('data-prepopulated-from="[&quot;title&quot;]"')
    expect(body).toContain('<summary class="fieldset-heading">Meta</summary>')
    expect(body).toContain('<div class="description">Extra data</div>')
    expect(body).toContain('type="datetime-local"')
    expect(body).toContain('type="date"')
    expect(body).toContain('class="vLargeTextField vJSONField"')
    expect(body).toContain('class="autocomplete-widget"')
    expect(body).toContain(
      'hx-get="/admin/autocomplete/?app_label=blog&amp;model_name=post&amp;field_name=category"',
    )
    expect(body).toContain('class="selector"')
    expect(body).toContain('name="comments-TOTAL_FORMS" value="1"')
    expect(body).toContain('name="comments-0-author"')
    expect(body).toContain('<template class="empty-form-template">')
    expect(body).toContain('name="_addanother"')
    expect(body).toContain('name="_continue"')
    expect(body).not.toContain('class="deletelink"')
  })

  it('shows field and non-field errors', async () => {
    await Post.objects.create({ title: 'Taken', slug: 'taken' })
    const res = await s.client.post('/admin/blog/post/add/', {
      form: postForm({
        title: '',
        slug: 'taken',
        status: 'bogus',
        metadata: '{oops',
        createdAt: 'not a date',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Please correct the errors below.')
    expect(body).toContain('This field is required.')
    expect(body).toContain('Select a valid choice. bogus is not one of the available choices.')
    expect(body).toContain('Enter a valid JSON.')
    expect(body).toContain('value has an invalid format')
    expect(await Post.objects.count()).toBe(1)
    const dup = await s.client.post('/admin/blog/post/add/', { form: postForm({ slug: 'taken' }) })
    expect(await dup.text()).toContain('Post with this Slug already exists.')
  })

  it('adds an object with M2M, JSON and dates, logs it and redirects', async () => {
    const cat = await Category.objects.create({ name: 'News' })
    const t1 = await Tag.objects.create({ name: 'a' })
    const t2 = await Tag.objects.create({ name: 'b' })
    const res = await s.client.post('/admin/blog/post/add/', {
      form: postForm({
        category: String(cat.pk),
        tags: [String(t1.pk), String(t2.pk)],
        published: 'on',
        metadata: '{"k": [1, 2]}',
        publishDate: '2024-06-01',
      }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin/blog/post/')
    const p = await Post.objects.get({ slug: 'hello-world' })
    expect(p.categoryId).toBe(cat.pk)
    expect(p.published).toBe(true)
    expect(p.metadata).toEqual({ k: [1, 2] })
    expect(p.publishDate).toBe('2024-06-01')
    expect(p.createdAt.toISOString()).toBe('2024-05-01T10:30:00.000Z')
    expect((await (p as any).tags.all()).map(String).sort()).toEqual(['a', 'b'])
    const list = await (await s.client.get('/admin/blog/post/')).text()
    expect(list).toContain('The post “Hello world” was added successfully.')
    const log = await LogEntry.objects.get({ objectId: String(p.pk) })
    expect(log.isAddition()).toBe(true)
    expect(log.changeMessage).toBe('[{"added":{}}]')
    expect(log.getChangeMessage()).toBe('Added.')
  })

  it('handles _continue, _addanother and _saveasnew', async () => {
    const cont = await s.client.post('/admin/blog/post/add/', { form: postForm({ _continue: '1' }) })
    const p = await Post.objects.get({ slug: 'hello-world' })
    expect(cont.headers.get('location')).toBe(`/admin/blog/post/${p.pk}/change/`)
    const page = await (await s.client.get(`/admin/blog/post/${p.pk}/change/`)).text()
    expect(page).toContain('was added successfully. You may edit it again below.')
    const another = await s.client.post(`/admin/blog/post/${p.pk}/change/`, {
      form: postForm({ title: 'Changed', _addanother: '1' }),
    })
    expect(another.headers.get('location')).toBe('/admin/blog/post/add/')
    const asNew = await s.client.post(`/admin/blog/post/${p.pk}/change/`, {
      form: postForm({ title: 'Copy', slug: 'copy', _saveasnew: '1' }),
    })
    const copy = await Post.objects.get({ slug: 'copy' })
    expect(copy.pk).not.toBe(p.pk)
    expect(asNew.headers.get('location')).toBe(`/admin/blog/post/${copy.pk}/change/`)
    expect((await Post.objects.get({ pk: p.pk })).title).toBe('Changed')
  })

  it('changes an object and records the changed fields', async () => {
    const p = await Post.objects.create({ title: 'Old', slug: 'old', body: 'x y z', views: 7 })
    const page = await (await s.client.get(`/admin/blog/post/${p.pk}/change/`)).text()
    expect(page).toContain('<h1>Change post</h1>')
    expect(page).toContain('<div class="readonly">7</div>')
    expect(page).toContain('<label>Word count:</label><div class="readonly">3</div>')
    expect(page).toContain(`href="/admin/blog/post/${p.pk}/history/"`)
    expect(page).toContain('href="/blog/old/" class="viewsitelink"')
    expect(page).toContain('name="_saveasnew"')
    const res = await s.client.post(`/admin/blog/post/${p.pk}/change/`, {
      form: postForm({
        title: 'New title',
        slug: 'old',
        body: 'x y z',
        createdAt: '2024-05-01T10:30',
        views: '999',
      }),
    })
    expect(res.status).toBe(302)
    const fresh = await Post.objects.get({ pk: p.pk })
    expect(fresh.title).toBe('New title')
    expect(fresh.views).toBe(7)
    const log = (await LogEntry.objects.filter({ objectId: String(p.pk) }).first())!
    expect(log.isChange()).toBe(true)
    expect(log.getChangeMessage()).toBe('Changed Title and Created at.')
    const history = await (await s.client.get(`/admin/blog/post/${p.pk}/history/`)).text()
    expect(history).toContain('Change history: New title')
    expect(history).toContain('Changed Title and Created at.')
    expect(history).toContain('admin')
    const index = await (await s.client.get('/admin/')).text()
    expect(index).toContain(`<li class="changelink">`)
    expect(index).toContain(`href="/admin/blog/post/${p.pk}/change/">New title</a>`)
  })

  it('redirects with a message for missing objects', async () => {
    const res = await s.client.get('/admin/blog/post/999/change/')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin/')
    const index = await (await s.client.get('/admin/')).text()
    expect(index).toContain('Post with ID “999” doesn’t exist. Perhaps it was deleted?')
    expect((await s.client.get('/admin/blog/post/abc/change/')).status).toBe(302)
    const bare = await s.client.get('/admin/blog/post/5/')
    expect(bare.status).toBe(301)
    expect(bare.headers.get('location')).toBe('/admin/blog/post/5/change/')
  })
})

describe('inlines', () => {
  it('adds, changes and deletes inline rows', async () => {
    const p = await Post.objects.create({
      title: 'P',
      slug: 'p',
      createdAt: new Date('2024-05-01T10:30:00Z'),
    })
    const keep = await Comment.objects.create({ postId: p.pk, author: 'keep', text: 'k' } as any)
    const gone = await Comment.objects.create({ postId: p.pk, author: 'gone', text: 'g' } as any)
    const page = await (await s.client.get(`/admin/blog/post/${p.pk}/change/`)).text()
    expect(page).toContain('name="comments-INITIAL_FORMS" value="2"')
    expect(page).toContain('name="comments-TOTAL_FORMS" value="3"')
    const ids = [...page.matchAll(/name="comments-(\d)-id" value="(\d+)"/g)].map((m) => [m[1], m[2]])
    expect(ids).toHaveLength(2)
    const form = postForm({
      title: 'P',
      slug: 'p',
      body: '',
      'comments-TOTAL_FORMS': '3',
      'comments-INITIAL_FORMS': '2',
    })
    for (const [i, pk] of ids) {
      form[`comments-${i}-id`] = pk
      form[`comments-${i}-author`] = pk === String(keep.pk) ? 'kept & edited' : 'gone'
      form[`comments-${i}-text`] = pk === String(keep.pk) ? 'k' : 'g'
      if (pk === String(gone.pk)) form[`comments-${i}-DELETE`] = 'on'
    }
    form['comments-2-author'] = 'new'
    form['comments-2-text'] = 'fresh'
    form['comments-2-approved'] = 'on'
    const res = await s.client.post(`/admin/blog/post/${p.pk}/change/`, { form })
    expect(res.status).toBe(302)
    const comments = (await Comment.objects.filter({ postId: p.pk }).orderBy('id')) as Comment[]
    expect(comments.map((c) => c.author)).toEqual(['kept & edited', 'new'])
    expect(comments[1].approved).toBe(true)
    const log = (await LogEntry.objects.filter({ objectId: String(p.pk) }).first())!
    expect(log.getChangeMessage()).toBe(
      'Added comment “Comment by new”. Changed Author for comment “Comment by kept & edited”. Deleted comment “Comment by gone”.',
    )
  })

  it('validates inline rows and ignores untouched extra forms', async () => {
    const res = await s.client.post('/admin/blog/post/add/', {
      form: postForm({
        'comments-TOTAL_FORMS': '2',
        'comments-0-author': 'only author',
        'comments-0-text': '',
        'comments-1-author': '',
        'comments-1-text': '',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Please correct the error below.')
    expect(body).toContain('This field is required.')
    expect(await Post.objects.count()).toBe(0)
    const ok = await s.client.post('/admin/blog/post/add/', {
      form: postForm({ 'comments-TOTAL_FORMS': '1', 'comments-0-author': '', 'comments-0-text': '' }),
    })
    expect(ok.status).toBe(302)
    expect(await Comment.objects.count()).toBe(0)
  })

  it('reports a tampered management form', async () => {
    const res = await s.client.post('/admin/blog/post/add/', {
      form: { ...postForm(), 'comments-TOTAL_FORMS': undefined },
    })
    expect(await res.text()).toContain('ManagementForm data is missing or has been tampered with.')
  })
})

describe('delete', () => {
  it('confirms and deletes with cascaded objects listed', async () => {
    const p = await Post.objects.create({ title: '<b>Bold</b>', slug: 'bold' })
    await Comment.objects.create({ postId: p.pk, author: 'x', text: 'y' } as any)
    const page = await (await s.client.get(`/admin/blog/post/${p.pk}/delete/`)).text()
    expect(page).toContain('Are you sure you want to delete the post “&lt;b&gt;Bold&lt;/b&gt;”?')
    expect(page).toContain('<li>Posts: 1</li>')
    expect(page).toContain('<li>Comments: 1</li>')
    expect(page).toContain('Comment: <a href="/admin/blog/comment/')
    expect(page).toContain('name="post" value="yes"')
    const res = await s.client.post(`/admin/blog/post/${p.pk}/delete/`, { form: { post: 'yes' } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin/blog/post/')
    expect(await Post.objects.count()).toBe(0)
    expect(await Comment.objects.count()).toBe(0)
    const list = await (await s.client.get('/admin/blog/post/')).text()
    expect(list).toContain('The post “&lt;b&gt;Bold&lt;/b&gt;” was deleted successfully.')
    const log = await LogEntry.objects.get({ objectId: String(p.pk) })
    expect(log.isDeletion()).toBe(true)
  })

  it('refuses to delete objects referenced through PROTECT', async () => {
    const pub = await Publisher.objects.create({ name: 'Acme' })
    await Post.objects.create({ title: 'Protected post', slug: 'pp', publisherId: pub.pk } as any)
    const page = await (await s.client.get(`/admin/blog/publisher/${pub.pk}/delete/`)).text()
    expect(page).toContain('Cannot delete publisher')
    expect(page).toContain('would require deleting the following protected related objects')
    expect(page).toContain('Protected post')
    await s.client.post(`/admin/blog/publisher/${pub.pk}/delete/`, { form: { post: 'yes' } })
    expect(await Publisher.objects.count()).toBe(1)
  })
})

describe('files', () => {
  it('uploads, shows and clears a file', async () => {
    const add = await s.client.get('/admin/blog/attachment/add/')
    expect(await add.text()).toContain('enctype="multipart/form-data"')
    const res = await s.client.post('/admin/blog/attachment/add/', {
      form: { name: 'Doc', file: new File(['hello'], 'report.txt', { type: 'text/plain' }) },
    })
    expect(res.status).toBe(302)
    const a = await Attachment.objects.get({ name: 'Doc' })
    expect((a as any).file.name).toBe('docs/report.txt')
    expect(await media.storage.exists('docs/report.txt')).toBe(true)
    const page = await (await s.client.get(`/admin/blog/attachment/${a.pk}/change/`)).text()
    expect(page).toContain('Currently: <a href="/media/docs/report.txt">docs/report.txt</a>')
    expect(page).toContain('name="file-clear"')
    // unchanged when no new file is sent
    await s.client.post(`/admin/blog/attachment/${a.pk}/change/`, { form: { name: 'Doc 2' } })
    expect(((await Attachment.objects.get({ pk: a.pk })) as any).file.name).toBe('docs/report.txt')
    await s.client.post(`/admin/blog/attachment/${a.pk}/change/`, {
      form: { name: 'Doc 2', 'file-clear': 'on' },
    })
    expect(((await Attachment.objects.get({ pk: a.pk })) as any).file.isEmpty).toBe(true)
  })
})

describe('autocomplete', () => {
  it('answers JSON for autocompleteFields and HTML for htmx', async () => {
    await Category.objects.create({ name: 'Apples' })
    await Category.objects.create({ name: 'Apricots' })
    await Category.objects.create({ name: 'Bananas' })
    const url = '/admin/autocomplete/?app_label=blog&model_name=post&field_name=category'
    const res = await s.client.get(`${url}&term=ap`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.results.map((r: any) => r.text)).toEqual(['Apples', 'Apricots'])
    expect(data.pagination).toEqual({ more: false })
    expect(typeof data.results[0].id).toBe('string')
    const htmx = await s.client.get(`${url}&term=ban`, { headers: { 'HX-Request': 'true' } })
    expect(await htmx.text()).toContain('data-autocomplete-id')
    // fields that aren't in autocompleteFields are refused
    expect(
      (await s.client.get('/admin/autocomplete/?app_label=blog&model_name=post&field_name=publisher')).status,
    ).toBe(403)
    expect((await s.client.get('/admin/autocomplete/?app_label=nope&model_name=x&field_name=y')).status).toBe(
      403,
    )
  })

  it('shows the selected option on the change form', async () => {
    const cat = await Category.objects.create({ name: 'Picked' })
    const p = await Post.objects.create({ title: 'P', slug: 'p', categoryId: cat.pk } as any)
    const page = await (await s.client.get(`/admin/blog/post/${p.pk}/change/`)).text()
    expect(page).toContain(`<option value="${cat.pk}" selected="">Picked</option>`)
  })
})
