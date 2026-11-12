import { Group, User } from '@ghuri/auth'
import { createContext, include, path, reverse, runWithContext } from '@ghuri/core'
import type { Context } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AdminSite,
  AlreadyRegistered,
  admin,
  display,
  getDisplayOptions,
  ModelAdmin,
  NotRegistered,
  quote,
  register,
  unquote,
} from '../src/index'
import { Category, Post, Tag } from './blog/models'
import { type AdminTestSetup, setupAdmin, urls } from './helpers'

class OpsSite extends AdminSite {
  override name = 'ops'
  override siteHeader = 'Ops console'
  override siteTitle = 'Ops'
  override indexTitle = 'Operations'
  override siteUrl = null
}
const ops = new OpsSite()

class TagOpsAdmin extends ModelAdmin<Tag> {
  override listDisplay = ['name', 'upper']
  upper = display({ description: 'Upper name' }, (obj: Tag) => obj.name.toUpperCase())

  override getUrls() {
    return [
      path(
        'report/',
        this.adminSite.adminView(async (c: Context) =>
          this.adminSite.renderPage(c, 'Tag report', <p>{await Tag.objects.count()} tags</p>),
        ),
        { name: 'blog_tag_report' },
      ),
      ...super.getUrls(),
    ]
  }
}
register(Tag, { site: ops })(TagOpsAdmin)

let s: AdminTestSetup
beforeAll(async () => {
  s = await setupAdmin({ urls: [...urls, path('ops/', ops.urls)] })
})
afterAll(async () => {
  await s?.db.teardown()
})
beforeEach(async () => {
  await s.flush()
})

describe('AdminSite', () => {
  it('reverses Django URL names', async () => {
    await s.client.withContext(() => {
      expect(reverse('admin:index')).toBe('/admin/')
      expect(reverse('admin:login')).toBe('/admin/login/')
      expect(reverse('admin:logout')).toBe('/admin/logout/')
      expect(reverse('admin:password_change')).toBe('/admin/password_change/')
      expect(reverse('admin:password_change_done')).toBe('/admin/password_change/done/')
      expect(reverse('admin:autocomplete')).toBe('/admin/autocomplete/')
      expect(reverse('admin:app_list', { app_label: 'blog' })).toBe('/admin/blog/')
      expect(reverse('admin:blog_post_changelist')).toBe('/admin/blog/post/')
      expect(reverse('admin:blog_post_add')).toBe('/admin/blog/post/add/')
      expect(reverse('admin:blog_post_change', { object_id: 3 })).toBe('/admin/blog/post/3/change/')
      expect(reverse('admin:blog_post_delete', { object_id: 3 })).toBe('/admin/blog/post/3/delete/')
      expect(reverse('admin:blog_post_history', { object_id: 3 })).toBe('/admin/blog/post/3/history/')
      expect(reverse('admin:auth_user_password_change', { object_id: 1 })).toBe(
        '/admin/auth/user/1/password/',
      )
      expect(reverse('ops:index')).toBe('/ops/')
      expect(reverse('ops:blog_tag_report')).toBe('/ops/blog/tag/report/')
      return null
    })
  })

  it('registers, unregisters and rejects duplicates', () => {
    const site = new AdminSite({ name: 'tmp' })
    site.register([Category, Tag])
    expect(site.isRegistered(Category)).toBe(true)
    expect(() => site.register(Category)).toThrow(AlreadyRegistered)
    site.unregister(Category)
    expect(site.isRegistered(Category)).toBe(false)
    expect(() => site.unregister(Category)).toThrow(NotRegistered)
    expect(() => site.register({} as any)).toThrow(/not a model class/)
    // TC39 decorator call shape: (value, context)
    class X extends ModelAdmin {}
    register(Category, { site })(X, { kind: 'class', name: 'X' })
    expect(site.getModelAdmin(Category)).toBeInstanceOf(X)
    // method decorator shapes
    const fn = (o: any) => o
    display({ description: 'D' })(fn, { kind: 'method', name: 'fn' })
    expect(getDisplayOptions(fn)?.description).toBe('D')
    const desc = { value: () => 1 } as PropertyDescriptor
    display({ boolean: true })({}, 'm', desc)
    expect(getDisplayOptions(desc.value)?.boolean).toBe(true)
  })

  it('auto-registers UserAdmin and GroupAdmin', () => {
    expect(admin.site.isRegistered(User)).toBe(true)
    expect(admin.site.isRegistered(Group)).toBe(true)
    expect(admin.site.getModelAdmin(User)).toBeInstanceOf(admin.UserAdmin)
    expect(admin.site.isRegistered(Post)).toBe(true)
  })

  it('serves a custom site with its own header, views and permissions', async () => {
    await s.superuser()
    await Tag.objects.create({ name: 'alpha' })
    const index = await (await s.client.get('/ops/')).text()
    expect(index).toContain('Ops console')
    expect(index).toContain('<title>Operations | Ops</title>')
    expect(index).toContain('href="/ops/blog/tag/"')
    expect(index).not.toContain('/ops/blog/post/')
    expect(index).not.toContain('View site')
    const list = await (await s.client.get('/ops/blog/tag/')).text()
    expect(list).toContain('Upper name')
    expect(list).toContain('ALPHA')
    const report = await (await s.client.get('/ops/blog/tag/report/')).text()
    expect(report).toContain('1 tags')
    s.client.clearCookies()
    const anon = await s.client.get('/ops/blog/tag/report/')
    expect(anon.headers.get('location')).toBe(
      `/ops/login/?${new URLSearchParams({ next: '/ops/blog/tag/report/' })}`,
    )
  })

  it('serves static assets with long cache headers', async () => {
    const css = await s.client.get('/admin/static/admin.css?v=1')
    expect(css.status).toBe(200)
    expect(css.headers.get('content-type')).toContain('text/css')
    expect(css.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const body = await css.text()
    expect(body).toContain('prefers-color-scheme: dark')
    const etag = css.headers.get('etag')!
    expect(
      (await s.client.get('/admin/static/admin.css', { headers: { 'If-None-Match': etag } })).status,
    ).toBe(304)
    const js = await s.client.get('/admin/static/admin.js')
    expect(js.headers.get('content-type')).toContain('javascript')
    expect((await s.client.get('/admin/static/nope.js')).status).toBe(404)
  })

  it('links the stylesheet, script and htmx (overridable with ADMIN_ASSETS)', async () => {
    await s.superuser()
    const body = await (await s.client.get('/admin/')).text()
    expect(body).toContain('<link rel="stylesheet" href="/admin/static/admin.css?v=')
    expect(body).toContain('<script src="/admin/static/admin.js?v=')
    expect(body).toContain('htmx.org@2')
    const settings = { ...s.ctx.settings, ADMIN_ASSETS: { htmx: '/static/htmx.js', css: ['/x.css'] } }
    const assets = runWithContext(createContext({ env: {}, settings }), () => admin.site.assets())
    expect(assets).toEqual({ htmx: '/static/htmx.js', css: ['/x.css'], js: [] })
    const none = runWithContext(
      createContext({ env: {}, settings: { ...settings, ADMIN_ASSETS: { htmx: false } } }),
      () => admin.site.assets(),
    )
    expect(none.htmx).toBeNull()
  })

  it('appends slashes, sends anonymous users to login and 404s unknown pages', async () => {
    const anon = await s.client.get('/admin/blog/nothing/')
    expect(anon.status).toBe(302)
    expect(anon.headers.get('location')).toContain('/admin/login/?next=')
    await s.superuser()
    const slash = await s.client.get('/admin/blog/post')
    expect(slash.status).toBe(301)
    expect(slash.headers.get('location')).toBe('/admin/blog/post/')
    expect((await s.client.get('/admin/blog/nothing/')).status).toBe(404)
  })

  it('quotes primary keys like Django', () => {
    expect(quote('a/b_c?')).toBe('a_2Fb_5Fc_3F')
    expect(unquote(quote('a/b_c? :%'))).toBe('a/b_c? :%')
  })

  it('includes site urls under include() too', () => {
    const entry = path('backoffice/', include(admin.site.urls))
    expect(entry.namespace).toBe('admin')
  })
})
