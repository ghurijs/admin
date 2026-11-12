import {
  AuthConfig,
  AuthenticationMiddleware,
  ContentType,
  ContentTypesConfig,
  createPermissions,
  PBKDF2PasswordHasher,
  Permission,
  SessionMiddleware,
  SessionsConfig,
  User,
} from '@ghuri/auth'
import {
  apps,
  CsrfMiddleware,
  createApp,
  defineSettings,
  type Env,
  type GhuriSettings,
  path,
} from '@ghuri/core'
import { createTestClient } from '@ghuri/core/testing'
import { createTablesForModels, setupTestDatabase, type TestBackend } from '@ghuri/orm/testing'
import { AdminConfig, admin } from '../src/index'
import { BlogConfig } from './blog/app'

export const SECRET = 'admin-test-secret'
export const FAST_HASHERS = [new PBKDF2PasswordHasher({ iterations: 1000 })]

export const urls = [path('admin/', admin.site.urls)]

export const INSTALLED_APPS = [ContentTypesConfig, AuthConfig, SessionsConfig, AdminConfig, BlogConfig]

export interface SetupOptions {
  using?: TestBackend
  settings?: Partial<GhuriSettings>
  urls?: any[]
}

/** createApp + setup + test database + client. */
export async function setupAdmin(opts: SetupOptions = {}) {
  const env: Env = {}
  const settings = defineSettings(() => ({
    SECRET_KEY: SECRET,
    INSTALLED_APPS,
    MIDDLEWARE: [SessionMiddleware, CsrfMiddleware, AuthenticationMiddleware],
    ROOT_URLCONF: opts.urls ?? urls,
    PASSWORD_HASHERS: FAST_HASHERS,
    ...opts.settings,
  }))
  const app = createApp(settings)
  const ctx = await app.setup(env)
  // The test app ('blog') has no migrations and references auth.User, so tables are created from the models
  // directly (the admin's own migration is exercised in migrations.test.ts).
  const db = await setupTestDatabase({ using: opts.using ?? 'sqlite', createTables: false })
  await createTablesForModels(db.connection, apps.getModels() as any)
  await createPermissions()
  const client = createTestClient(app, { env })
  return {
    app,
    env,
    ctx,
    db,
    client,
    async flush() {
      await db.flush()
      ContentType.objects.clearCache()
      await createPermissions()
      client.clearCookies()
    },
    async superuser(username = 'admin') {
      const u = await User.objects.createSuperuser(username, `${username}@example.com`, 'secret-pass-123')
      await client.forceLogin(u)
      return u
    },
    /** A staff user with the given permissions (`'blog.view_post'`), logged in. */
    async staff(perms: string[] = [], username = 'staff') {
      const u = await User.objects.createUser(username, `${username}@example.com`, 'secret-pass-123', {
        isStaff: true,
      })
      for (const p of perms) {
        const [app, codename] = p.split('.')
        const perm = await Permission.objects.get({ codename, contentType__appLabel: app })
        await (u as any).userPermissions.add(perm)
      }
      await client.forceLogin(u)
      return u
    },
  }
}

export type AdminTestSetup = Awaited<ReturnType<typeof setupAdmin>>

/** Read the HTML body. */
export async function html(res: Response): Promise<string> {
  return await res.text()
}
