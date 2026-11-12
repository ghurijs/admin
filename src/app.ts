// The `admin` app config.
import { AppConfig, apps, ImproperlyConfigured, tryGetContext } from '@ghuri/core'
import { Migration, migrationsFromModule } from '@ghuri/orm/migrations'
import * as adminMigrations from './migrations/index'
import { LogEntry } from './models'

/**
 * The admin's migrations, adapted to `AUTH_USER_MODEL`: `LogEntry.user` points at the custom user model and
 * the migration depends on its app (Django's `swappable_dependency`).
 */
function migrationsForUserModel(): Record<string, unknown> {
  const label = tryGetContext()?.settings.AUTH_USER_MODEL as string | undefined
  if (!label || label.toLowerCase() === 'auth.user') return adminMigrations
  const userApp = label.split('.')[0]
  const out: Record<string, Migration> = {}
  for (const [name, m] of migrationsFromModule(adminMigrations) ?? []) {
    const operations = m.operations.map((op: any) => {
      if (!op.fields) return op
      const fields = Object.fromEntries(
        Object.entries(op.fields as Record<string, any>).map(([k, f]) => {
          const to = f?.options?.to ?? f?.to
          if (typeof to !== 'string' || to.toLowerCase() !== 'auth.user') return [k, f]
          return [k, f.options ? { ...f, options: { ...f.options, to: label } } : { ...f, to: label }]
        }),
      )
      return Object.assign(Object.create(Object.getPrototypeOf(op)), op, { fields })
    })
    const dependencies = m.dependencies.filter((d) => d[0] !== 'auth')
    if (!dependencies.some((d) => d[0] === userApp)) dependencies.push([userApp, '__first__'] as const)
    const adapted = new Migration({ dependencies, operations, initial: m.initial })
    adapted.name = m.name || name
    out[adapted.name] = adapted
  }
  return { migrations: out }
}

/** `path` when running from the TypeScript sources (makemigrations), undefined in dist / on Workers. */
function appPath(): string | undefined {
  const meta = import.meta as ImportMeta & { dirname?: string; filename?: string }
  if (!meta.dirname || !/[\\/]src$/.test(meta.dirname) || !/\.[cm]?ts$/.test(meta.filename ?? ''))
    return undefined
  return meta.dirname
}

/**
 * Add to INSTALLED_APPS (after `ContentTypesConfig`, `AuthConfig` and `SessionsConfig`). Provides the
 * `LogEntry` model (table `django_admin_log`) and its migration. ModelAdmins register when your apps'
 * `admin` modules are imported (`admin = admin` on your AppConfig, or any import).
 */
export class AdminConfig extends AppConfig {
  name = '@ghuri/admin'
  override label = 'admin'
  override verboseName = 'Administration'
  override path = appPath()
  override migrations = migrationsForUserModel()
  override models = { LogEntry }

  override ready(): void {
    for (const [label, cfg] of [
      ['contenttypes', 'ContentTypesConfig'],
      ['auth', 'AuthConfig'],
    ]) {
      if (!apps.isInstalled(label)) {
        throw new ImproperlyConfigured(
          `'@ghuri/admin' requires '${label}': add ${cfg} from '@ghuri/auth' to INSTALLED_APPS before AdminConfig.`,
        )
      }
    }
  }
}
