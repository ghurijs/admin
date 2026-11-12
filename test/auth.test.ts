import { User } from '@ghuri/auth'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LogEntry } from '../src/index'
import { Post } from './blog/models'
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
})

describe('login / logout', () => {
  it('redirects anonymous users to the login page with next', async () => {
    const res = await s.client.get('/admin/blog/post/?q=x')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `/admin/login/?${new URLSearchParams({ next: '/admin/blog/post/?q=x' })}`,
    )
  })

  it('renders the login form with a CSRF cookie', async () => {
    const res = await s.client.get('/admin/login/?next=/admin/blog/')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('id="login-form"')
    expect(body).toContain('name="csrfmiddlewaretoken"')
    expect(body).toContain('name="next" value="/admin/blog/"')
    expect(s.client.getCookie('csrftoken')).toBeTruthy()
  })

  it('logs a staff user in and follows a safe next URL', async () => {
    await User.objects.createUser('ann', 'ann@example.com', 'pw-123456', { isStaff: true })
    const res = await s.client.post('/admin/login/', {
      form: { username: 'ann', password: 'pw-123456', next: '/admin/blog/' },
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/admin/blog/')
    const index = await s.client.get('/admin/')
    expect(index.status).toBe(200)
    expect(await index.text()).toContain('Welcome, <strong>ann</strong>')
  })

  it('ignores unsafe next URLs', async () => {
    await User.objects.createUser('ann', 'ann@example.com', 'pw-123456', { isStaff: true })
    const res = await s.client.post('/admin/login/', {
      form: { username: 'ann', password: 'pw-123456', next: 'https://evil.example.com/' },
    })
    expect(res.headers.get('location')).toBe('/admin/')
  })

  it('rejects bad credentials and non-staff users', async () => {
    await User.objects.createUser('bob', 'bob@example.com', 'pw-123456')
    for (const password of ['wrong', 'pw-123456']) {
      const res = await s.client.post('/admin/login/', { form: { username: 'bob', password } })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain(
        'Please enter the correct username and password for a staff account. Note that both fields may be case-sensitive.',
      )
    }
    expect((await s.client.get('/admin/')).status).toBe(302)
  })

  it('tells logged-in non-staff users they are not authorized', async () => {
    const bob = await User.objects.createUser('bob', 'bob@example.com', 'pw-123456')
    await s.client.forceLogin(bob)
    const res = await s.client.get('/admin/', { follow: true })
    expect(await res.text()).toContain(
      'You are authenticated as bob, but are not authorized to access this page.',
    )
  })

  it('logs out with POST only', async () => {
    await s.superuser()
    expect((await s.client.get('/admin/logout/')).status).toBe(405)
    const res = await s.client.post('/admin/logout/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Thanks for spending some quality time with the web site today.')
    expect((await s.client.get('/admin/')).status).toBe(302)
  })

  it('rejects POSTs without a CSRF token', async () => {
    await User.objects.createUser('ann', 'ann@example.com', 'pw-123456', { isStaff: true })
    const login = await s.client.post('/admin/login/', {
      form: { username: 'ann', password: 'pw-123456' },
      csrf: false,
    })
    expect(login.status).toBe(403)
    await s.superuser()
    const add = await s.client.post('/admin/blog/category/add/', { form: { name: 'x' }, csrf: false })
    expect(add.status).toBe(403)
  })
  it('accepts the token from the csrfmiddlewaretoken form field (urlencoded and multipart)', async () => {
    await s.superuser()
    const page = await (await s.client.get('/admin/blog/category/add/')).text()
    const token = /name="csrfmiddlewaretoken" value="([^"]+)"/.exec(page)![1]
    const res = await s.client.post('/admin/blog/category/add/', {
      form: { csrfmiddlewaretoken: token, name: 'Via form field' },
      csrf: false,
    })
    expect(res.status).toBe(302)
    const multipart = await s.client.post('/admin/blog/attachment/add/', {
      form: { csrfmiddlewaretoken: token, name: 'Multi', file: new File(['x'], 'x.txt') },
      csrf: false,
    })
    expect(multipart.status).toBe(302)
  })
})

describe('password change', () => {
  it('changes the password and keeps the session', async () => {
    const u = await s.superuser()
    const bad = await s.client.post('/admin/password_change/', {
      form: { old_password: 'nope', new_password1: 'n3w-passw0rd', new_password2: 'other' },
    })
    const body = await bad.text()
    expect(body).toContain('Your old password was entered incorrectly.')
    expect(body).toContain('The two password fields didn’t match.')
    const res = await s.client.post('/admin/password_change/', {
      form: { old_password: 'secret-pass-123', new_password1: 'n3w-passw0rd', new_password2: 'n3w-passw0rd' },
    })
    expect(res.headers.get('location')).toBe('/admin/password_change/done/')
    const done = await s.client.get('/admin/password_change/done/')
    expect(await done.text()).toContain('Your password was changed.')
    expect(await (await User.objects.get({ pk: u.pk })).checkPassword('n3w-passw0rd')).toBe(true)
  })
})

describe('permissions', () => {
  it('shows a no-permission index for staff without permissions', async () => {
    await s.staff([])
    const res = await s.client.get('/admin/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('You don’t have permission to view or edit anything.')
    expect((await s.client.get('/admin/blog/post/')).status).toBe(403)
    expect((await s.client.get('/admin/blog/post/add/')).status).toBe(403)
    expect((await s.client.get('/admin/blog/')).status).toBe(404)
  })

  it('lists only the models the user may see', async () => {
    await s.staff(['blog.view_post', 'blog.add_tag'])
    const body = await (await s.client.get('/admin/')).text()
    expect(body).toContain('href="/admin/blog/post/" class="viewlink"')
    expect(body).not.toContain('href="/admin/blog/post/add/"')
    expect(body).toContain('href="/admin/blog/tag/add/" class="addlink"')
    expect(body).not.toContain('/admin/blog/category/')
    expect(body).not.toContain('/admin/auth/user/')
    const app = await (await s.client.get('/admin/blog/')).text()
    expect(app).toContain('Blog administration')
    expect((await s.client.get('/admin/auth/')).status).toBe(404)
  })

  it('makes the change form read-only for view-only users', async () => {
    const p = await Post.objects.create({ title: 'Hello', slug: 'hello' })
    await s.staff(['blog.view_post', 'blog.view_comment'])
    const list = await s.client.get('/admin/blog/post/')
    const listBody = await list.text()
    expect(listBody).toContain('Select post to view')
    expect(listBody).not.toContain('name="action"')
    const change = await s.client.get(`/admin/blog/post/${p.pk}/change/`)
    expect(change.status).toBe(200)
    const body = await change.text()
    expect(body).toContain('View post')
    expect(body).not.toContain('name="_save"')
    expect(body).not.toContain('name="title"')
    expect(body).toContain('<div class="readonly">Hello</div>')
    expect(body).toContain('class="closelink"')
    const post = await s.client.post(`/admin/blog/post/${p.pk}/change/`, { form: { title: 'Changed' } })
    expect(post.status).toBe(403)
    expect((await s.client.post(`/admin/blog/post/${p.pk}/delete/`, { form: { post: 'yes' } })).status).toBe(
      403,
    )
    expect((await Post.objects.get({ pk: p.pk })).title).toBe('Hello')
  })

  it('hides actions the user has no permission for', async () => {
    await Post.objects.create({ title: 'Hello', slug: 'hello' })
    await s.staff(['blog.view_post', 'blog.delete_post'])
    const body = await (await s.client.get('/admin/blog/post/')).text()
    expect(body).toContain('value="delete_selected"')
    expect(body).not.toContain('value="make_published"')
    expect(body).not.toContain('value="markDraft"')
  })
})

describe('UserAdmin', () => {
  it('creates a user with a hashed password and continues to the change form', async () => {
    await s.superuser()
    const mismatch = await s.client.post('/admin/auth/user/add/', {
      form: { username: 'carol', password1: 'abc-12345', password2: 'abc-99999' },
    })
    expect(await mismatch.text()).toContain('The two password fields didn’t match.')
    const res = await s.client.post('/admin/auth/user/add/', {
      form: { username: 'carol', password1: 'abc-12345', password2: 'abc-12345', _save: 'Save' },
    })
    expect(res.status).toBe(302)
    const carol = await User.objects.get({ username: 'carol' })
    expect(res.headers.get('location')).toBe(`/admin/auth/user/${carol.pk}/change/`)
    expect(carol.password.startsWith('pbkdf2_sha256$')).toBe(true)
    expect(await carol.checkPassword('abc-12345')).toBe(true)
    const change = await (await s.client.get(res.headers.get('location')!)).text()
    expect(change).toContain('<strong>algorithm</strong>')
    expect(change).toContain('this form')
    expect(change).not.toContain(carol.password)
    const log = await LogEntry.objects.get({ objectId: String(carol.pk) })
    expect(log.isAddition()).toBe(true)
  })

  it('sets a password through the change-password form', async () => {
    await s.superuser()
    const dave = await User.objects.createUser('dave', 'd@example.com', 'old-pass-1')
    const url = `/admin/auth/user/${dave.pk}/password/`
    expect(await (await s.client.get(url)).text()).toContain(
      'Enter a new password for the user <strong>dave</strong>',
    )
    const res = await s.client.post(url, { form: { password1: 'brand-new-1', password2: 'brand-new-1' } })
    expect(res.headers.get('location')).toBe(`/admin/auth/user/${dave.pk}/change/`)
    expect(await (await User.objects.get({ pk: dave.pk })).checkPassword('brand-new-1')).toBe(true)
    const entry = (await LogEntry.objects.filter({ objectId: String(dave.pk) }).first())!
    expect(entry.getChangeMessage()).toBe('Changed password.')
  })

  it('saves groups and flags from the change form', async () => {
    const admin = await s.superuser()
    const res = await s.client.get(`/admin/auth/user/${admin.pk}/change/`)
    const body = await res.text()
    expect(body).toContain('name="isStaff"')
    expect(body).toContain('class="selector"')
    const post = await s.client.post(`/admin/auth/user/${admin.pk}/change/`, {
      form: {
        username: 'admin',
        firstName: 'Ada',
        lastName: '',
        email: 'admin@example.com',
        isActive: 'on',
        isStaff: 'on',
        isSuperuser: 'on',
        lastLogin: '',
        dateJoined: '2024-01-01T10:00',
      },
    })
    expect(post.status).toBe(302)
    const u = await User.objects.get({ pk: admin.pk })
    expect(u.firstName).toBe('Ada')
    expect(u.password).toBe(admin.password)
  })
})
