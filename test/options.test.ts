import { path } from '@ghuri/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AdminSite, display, HORIZONTAL, ModelAdmin, StackedInline } from '../src/index'
import { ADMIN_JS } from '../src/static/js'
import { Category, Comment, Post, Publisher } from './blog/models'
import { type AdminTestSetup, setupAdmin, urls } from './helpers'

const site = new AdminSite({ name: 'opts', siteHeader: 'Options' })

class StackedComments extends StackedInline<Comment> {
  model = Comment
  extra = 0
  maxNum = 2
  showChangeLink = true
  override readonlyFields = ['approved']
}

class PostOptions extends ModelAdmin<Post> {
  override fields = [
    'title',
    ['slug', 'status'],
    'category',
    'publisher',
    'tags',
    'body',
    'createdAt',
    'summary',
  ]
  override readonlyFields = [
    display({ description: 'Summary line' }, function summary(obj: Post) {
      return `${obj.title} (${obj.views} views)`
    }),
  ]
  override radioFields = { status: HORIZONTAL, publisher: 'vertical' as const }
  override rawIdFields = ['category']
  override filterVertical = ['tags']
  override formfieldOverrides = { TextField: { widget: 'text' as const, attrs: { size: 80 } } }
  override listDisplay = ['title', 'category', 'publishDate']
  override listDisplayLinks = null
  override emptyValueDisplay = '(none)'
  override inlines = [StackedComments]
  override actions = null
  override saveOnTop = true
}
site.register(Post, PostOptions)
site.register(Category)
site.register(Comment)

class PublisherOptions extends ModelAdmin<Publisher> {
  override exclude = ['name']
}
site.register(Publisher, PublisherOptions)

let s: AdminTestSetup
beforeAll(async () => {
  s = await setupAdmin({ urls: [...urls, path('opts/', site.urls)] })
})
afterAll(async () => {
  await s?.db.teardown()
})
beforeEach(async () => {
  await s.flush()
  await s.superuser()
})

describe('ModelAdmin options', () => {
  it('renders fields, lines, radio, raw id, overrides and readonly callables', async () => {
    const cat = await Category.objects.create({ name: 'Cat <1>' })
    const pub = await Publisher.objects.create({ name: 'Pub' })
    const p = await Post.objects.create({
      title: 'T',
      slug: 't',
      categoryId: cat.pk,
      publisherId: pub.pk,
      views: 3,
    } as any)
    await Comment.objects.create({ postId: p.pk, author: 'a', text: 'b', approved: true } as any)
    const body = await (await s.client.get(`/opts/blog/post/${p.pk}/change/`)).text()
    expect(body).toContain('class="form-row field-slug field-status"')
    expect(body).toContain('class="flex-container fieldBox field-slug"')
    expect(body).toContain('class="radiolist inline"')
    expect(body).toContain('type="radio" name="status" value="draft"')
    expect(body).toContain(`type="radio" name="publisher" value="${pub.pk}"`)
    expect(body).toContain('class="vForeignKeyRawIdAdminField"')
    expect(body).toContain('href="/opts/blog/category/"')
    expect(body).toContain(
      `<strong><a href="/opts/blog/category/${cat.pk}/change/">Cat &lt;1&gt;</a></strong>`,
    )
    expect(body).toContain('class="selector stacked"')
    expect(body).toMatch(/<input type="text" name="body" id="id_body"[^>]*size="80"/)
    expect(body).toContain('<label>Summary line:</label><div class="readonly">T (3 views)</div>')
    // stacked inline
    expect(body).toContain('data-inline-type="stacked"')
    expect(body).toContain('<b>comment:</b>')
    expect(body).toContain('class="inlinechangelink"')
    expect(body).toContain('name="comments-MAX_NUM_FORMS" value="2"')
    expect(body).toMatch(/<label>Approved:<\/label><div class="readonly"><span class="icon-yes"/)
    // save on top + bottom
    expect(body.match(/name="_save"/g)).toHaveLength(2)
  })

  it('saves radio and raw id values', async () => {
    const cat = await Category.objects.create({ name: 'C' })
    const pub = await Publisher.objects.create({ name: 'P' })
    const res = await s.client.post('/opts/blog/post/add/', {
      form: {
        title: 'New',
        slug: 'new',
        status: 'published',
        category: String(cat.pk),
        publisher: String(pub.pk),
        body: 'x',
        createdAt: '2024-01-01T00:00',
        'comments-TOTAL_FORMS': '0',
        'comments-INITIAL_FORMS': '0',
      },
    })
    expect(res.status).toBe(302)
    const p = await Post.objects.get({ slug: 'new' })
    expect(p.status).toBe('published')
    expect(p.categoryId).toBe(cat.pk)
    expect(p.publisherId).toBe(pub.pk)
    const bad = await s.client.post('/opts/blog/post/add/', {
      form: {
        title: 'X',
        slug: 'x',
        status: 'draft',
        category: '999',
        createdAt: '2024-01-01T00:00',
        'comments-TOTAL_FORMS': '0',
        'comments-INITIAL_FORMS': '0',
      },
    })
    expect(await bad.text()).toContain(
      'Select a valid choice. That choice is not one of the available choices.',
    )
  })

  it('honours listDisplayLinks = null, emptyValueDisplay and actions = null', async () => {
    await Post.objects.create({ title: 'NoLink', slug: 'nl' })
    const body = await (await s.client.get('/opts/blog/post/')).text()
    expect(body).toContain('<td class="field-title">NoLink</td>')
    expect(body).toContain('<td class="field-category">(none)</td>')
    expect(body).not.toContain('name="action"')
  })

  it('excludes fields', async () => {
    const body = await (await s.client.get('/opts/blog/publisher/add/')).text()
    expect(body).not.toContain('name="name"')
  })

  it('ships syntactically valid JavaScript', () => {
    expect(() => new Function(ADMIN_JS)).not.toThrow()
  })
})
