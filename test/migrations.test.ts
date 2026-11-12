import {
  AuthConfig,
  AuthenticationMiddleware,
  ContentTypesConfig,
  SessionMiddleware,
  SessionsConfig,
  User,
} from '@ghuri/auth'
import { CsrfMiddleware, createApp, defineSettings, path } from '@ghuri/core'
import { createTestClient } from '@ghuri/core/testing'
import { makeMigrations } from '@ghuri/orm/migrations'
import { setupTestDatabase } from '@ghuri/orm/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminConfig, admin, LogEntry } from '../src/index'
import { FAST_HASHERS, SECRET } from './helpers'

// Only bundled apps: the test database is built by running migrations (auth's and the admin's own).
describe('admin migrations', () => {
  const env = {}
  const app = createApp(
    defineSettings(() => ({
      SECRET_KEY: SECRET,
      INSTALLED_APPS: [ContentTypesConfig, AuthConfig, SessionsConfig, AdminConfig],
      MIDDLEWARE: [SessionMiddleware, CsrfMiddleware, AuthenticationMiddleware],
      ROOT_URLCONF: [path('admin/', admin.site.urls)],
      PASSWORD_HASHERS: FAST_HASHERS,
    })),
  )
  let db: Awaited<ReturnType<typeof setupTestDatabase>>
  beforeAll(async () => {
    await app.setup(env)
    db = await setupTestDatabase({ using: 'sqlite' })
  })
  afterAll(async () => {
    await db?.teardown()
  })

  it('creates django_admin_log and matches the model', async () => {
    const rows = await db.connection.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'django_admin_log'",
    )
    expect(rows.rows).toHaveLength(1)
    const result = await makeMigrations({ appLabels: ['admin'], check: true })
    expect(result.migrations).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('records and shows admin actions', async () => {
    const u = await User.objects.createSuperuser('root', 'root@example.com', 'pw-123456')
    const client = createTestClient(app, { env })
    await client.forceLogin(u)
    const res = await client.post('/admin/auth/group/add/', { form: { name: 'editors' } })
    expect(res.status).toBe(302)
    expect(await LogEntry.objects.count()).toBe(1)
    const index = await (await client.get('/admin/')).text()
    expect(index).toContain('editors')
    expect(index).toContain('<li class="addlink">')
  })
})
