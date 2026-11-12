// AdminSite (Django's django.contrib.admin.sites).
import {
  authenticate,
  login as authLogin,
  logout as authLogout,
  getUserModel,
  isSafeRedirect,
  passwordValidatorsHelpTexts,
  updateSessionAuthHash,
  validatePassword,
} from '@ghuri/auth'
import {
  apps,
  enforceCsrf,
  getCsrfToken,
  getHost,
  getUser,
  Http404,
  ImproperlyConfigured,
  include,
  json,
  kwargs,
  PermissionDenied,
  path,
  render,
  rePath,
  resolve,
  reverse,
  setCsrfCookieIfNeeded,
  setting,
  type UrlEntry,
  type UrlPatterns,
  ValidationError,
} from '@ghuri/core'
import type { BaseModel, ModelClass } from '@ghuri/orm'
import type { Context } from 'hono'
import type { Child } from 'hono/jsx'
import { deleteSelected } from './actions'
import { consumeMessages } from './messages'
import { LogEntry } from './models'
import { type ActionFunction, ModelAdmin } from './options'
import { ADMIN_CSS } from './static/css'
import { ADMIN_JS } from './static/js'
import type { AdminAssets, AdminContext, AppEntry } from './templates/base'
import { Page } from './templates/base'
import {
  AppIndexPage,
  IndexPage,
  LoggedOutPage,
  LoginPage,
  MessagePage,
  PasswordFormPage,
  type RecentAction,
} from './templates/pages'
import { capfirst, escapeRegExp, objectRepr, quote } from './utils'

export const VERSION = '0.1.0-alpha.0'
export const DEFAULT_HTMX_URL = 'https://cdn.jsdelivr.net/npm/htmx.org@2.0.4/dist/htmx.min.js'

/** `ADMIN_ASSETS` setting: where the admin loads htmx from, plus extra stylesheets / scripts. */
export interface AdminAssetsSetting {
  /** URL of htmx (default: jsDelivr CDN); `false`/`null` to disable htmx. */
  htmx?: string | false | null
  /** Extra stylesheets added to every admin page. */
  css?: string[]
  /** Extra scripts (deferred) added to every admin page. */
  js?: string[]
}

declare module '@ghuri/core' {
  interface GhuriSettings {
    ADMIN_ASSETS?: AdminAssetsSetting
  }
}

export class AlreadyRegistered extends ImproperlyConfigured {}
export class NotRegistered extends ImproperlyConfigured {}

export type ModelAdminClass = new (model: ModelClass, site: AdminSite) => ModelAdmin<any>

export interface AdminSiteOptions {
  name?: string
  siteHeader?: string
  siteTitle?: string
  indexTitle?: string
  siteUrl?: string | null
  emptyValueDisplay?: string
  enableNavSidebar?: boolean
}

interface Registration {
  admin: ModelAdmin<any>
  /** Registered automatically (UserAdmin/GroupAdmin): only active when the model is installed. */
  auto: boolean
}

type View = (c: Context) => Promise<Response> | Response

const NEVER_CACHE = 'max-age=0, no-cache, no-store, must-revalidate, private'

function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const ASSET_ETAGS = {
  'admin.css': `"${VERSION}-${hashString(ADMIN_CSS)}"`,
  'admin.js': `"${VERSION}-${hashString(ADMIN_JS)}"`,
}

/**
 * An admin site: a registry of ModelAdmins plus the index, login, logout and password pages.
 * `admin.site` is the default instance; create others for separate admins (`new AdminSite({ name: 'staff' })`).
 */
export class AdminSite {
  name = 'admin'
  siteHeader = 'Ghuri administration'
  siteTitle = 'Ghuri site admin'
  indexTitle = 'Site administration'
  siteUrl: string | null = '/'
  emptyValueDisplay = '-'
  enableNavSidebar = true
  /** Catch-all view at the end of the URLs (redirects anonymous users to the login page). */
  finalCatchAll = true

  private readonly _registry = new Map<ModelClass, Registration>()
  private readonly _actions = new Map<string, ActionFunction>([
    ['delete_selected', deleteSelected as ActionFunction],
  ])
  private readonly _globalActions = new Map<string, ActionFunction>(this._actions)
  private version = 0
  private urlCache: { key: string; urls: UrlEntry[] } | null = null
  private catchAllView?: View

  constructor(opts: AdminSiteOptions = {}) {
    for (const [k, v] of Object.entries(opts)) if (v !== undefined) (this as any)[k] = v
  }

  // ---- registry -------------------------------------------------------------------------------

  /**
   * Register models with an admin class (Django's `site.register`):
   * `site.register(Post, PostAdmin)`, `site.register([Tag, Category])`.
   */
  register(
    modelOrModels: ModelClass | ModelClass[] | unknown,
    adminClass?: ModelAdminClass,
    opts: { auto?: boolean } = {},
  ): void {
    const models = (Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels]) as ModelClass[]
    const cls = adminClass ?? ModelAdmin
    for (const model of models) {
      if (!model || typeof (model as any)._meta !== 'object') {
        throw new ImproperlyConfigured(
          `${String(model)} is not a model class and can't be registered with the admin.`,
        )
      }
      if ((model as any)._meta.abstract) {
        throw new ImproperlyConfigured(
          `The model ${(model as any)._meta.objectName} is abstract, so it cannot be registered with admin.`,
        )
      }
      const existing = this._registry.get(model)
      if (existing && !existing.auto) {
        throw new AlreadyRegistered(
          `The model ${model.name} is already registered with '${this.constructor.name}'.`,
        )
      }
      this._registry.set(model, { admin: new cls(model, this), auto: !!opts.auto })
    }
    this.version++
  }

  /** Remove models from the registry (Django's `site.unregister`). */
  unregister(modelOrModels: ModelClass | ModelClass[] | unknown): void {
    const models = (Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels]) as ModelClass[]
    for (const model of models) {
      if (!this._registry.has(model))
        throw new NotRegistered(`The model ${(model as any)?.name} is not registered`)
      this._registry.delete(model)
    }
    this.version++
  }

  isRegistered(model: ModelClass | unknown): boolean {
    const reg = this._registry.get(model as ModelClass)
    return !!reg && this.isActive(model as ModelClass, reg)
  }

  private isActive(model: ModelClass, reg: Registration): boolean {
    // Models of apps that aren't installed have no app label: skip them instead of failing every page.
    if (!(model._meta as any).hasAppLabel) return false
    if (!reg.auto) return true
    try {
      const label = model._meta.appLabel
      return apps.isInstalled(label) && apps.getModels(label).includes(model)
    } catch {
      return false
    }
  }

  /** Active registrations: model → ModelAdmin. */
  get registry(): Map<ModelClass, ModelAdmin<any>> {
    const out = new Map<ModelClass, ModelAdmin<any>>()
    for (const [model, reg] of this._registry) if (this.isActive(model, reg)) out.set(model, reg.admin)
    return out
  }

  getModelAdmin(model: ModelClass | unknown): ModelAdmin<any> | undefined {
    const reg = this._registry.get(model as ModelClass)
    return reg && this.isActive(model as ModelClass, reg) ? reg.admin : undefined
  }

  // ---- actions --------------------------------------------------------------------------------

  /** Register a site-wide action (available on every ModelAdmin). */
  addAction(fn: ActionFunction, name?: string): void {
    const n = name ?? fn.name
    this._actions.set(n, fn)
    this._globalActions.set(n, fn)
  }

  /** Disable a site-wide action (e.g. `'delete_selected'`); it stays usable when named explicitly. */
  disableAction(name: string): void {
    if (!this._actions.has(name)) throw new Error(`Action '${name}' is not enabled.`)
    this._actions.delete(name)
  }

  getAction(name: string): ActionFunction | undefined {
    return this._globalActions.get(name)
  }

  /** Names of the enabled site-wide actions. */
  enabledActions(): string[] {
    return [...this._actions.keys()]
  }

  // ---- permissions & views ---------------------------------------------------------------------

  /** Can the request's user use the admin? (Django: active staff). */
  async hasPermission(c: Context): Promise<boolean> {
    const u = getUser(c)
    return !!(u.isAuthenticated && u.isActive && u.isStaff)
  }

  /**
   * Wrap a view: staff only (others are redirected to the login page), CSRF-checked, not cached.
   * Use it for custom admin views in `getUrls()`.
   */
  adminView(view: View, opts: { cacheable?: boolean } = {}): View {
    return async (c: Context) => {
      if (!(await this.hasPermission(c))) {
        const url = new URL(c.req.url)
        if (url.pathname === this.tryReverse('logout')) return c.redirect(this.reverse('index'), 302)
        return c.redirect(
          `${this.reverse('login')}?${new URLSearchParams({ next: url.pathname + url.search })}`,
          302,
        )
      }
      await enforceCsrf(c)
      const res = await view(c)
      if (!opts.cacheable) {
        try {
          if (!res.headers.has('Cache-Control')) res.headers.set('Cache-Control', NEVER_CACHE)
        } catch {}
      }
      return res
    }
  }

  // ---- URLs -----------------------------------------------------------------------------------

  /** `reverse('<site name>:<name>')`. */
  reverse(name: string, params?: Record<string, unknown>, query?: Record<string, unknown>): string {
    return reverse(`${this.name}:${name}`, params, query ? { query } : {})
  }

  /** `reverse()` that returns null instead of throwing. */
  tryReverse(name: string, params?: Record<string, unknown>): string | null {
    try {
      return this.reverse(name, params)
    } catch {
      return null
    }
  }

  staticUrl(name: string): string {
    return `${this.reverse('static', { path: name })}?v=${VERSION}`
  }

  /** URL patterns (Django's `get_urls`). Override to add site-level views. */
  getUrls(): UrlEntry[] {
    const wrap = (v: View, cacheable = false) => this.adminView(v, { cacheable })
    const urls: UrlEntry[] = [
      path(
        '',
        wrap((c) => this.index(c)),
        { name: 'index' },
      ),
      path('login/', (c) => this.login(c), { name: 'login' }),
      path(
        'logout/',
        wrap((c) => this.logout(c)),
        { name: 'logout' },
      ),
      path(
        'password_change/',
        wrap((c) => this.passwordChange(c), true),
        { name: 'password_change' },
      ),
      path(
        'password_change/done/',
        wrap((c) => this.passwordChangeDone(c), true),
        { name: 'password_change_done' },
      ),
      path(
        'autocomplete/',
        wrap((c) => this.autocompleteView(c)),
        { name: 'autocomplete' },
      ),
      path('static/<str:path>', (c) => this.staticView(c), { name: 'static' }),
    ]
    const labels = new Set<string>()
    for (const [model, ma] of this.registry) {
      const meta = model._meta
      if (!meta.hasAppLabel) continue
      urls.push(path(`${meta.appLabel}/${meta.modelName}/`, include(ma.urls)))
      labels.add(meta.appLabel)
    }
    if (labels.size) {
      const re = [...labels].map(escapeRegExp).join('|')
      urls.push(
        rePath(
          `^(?P<app_label>${re})/$`,
          wrap((c) => this.appIndex(c)),
          { name: 'app_list' },
        ),
      )
    }
    if (this.finalCatchAll) {
      this.catchAllView = (c) => this.catchAll(c)
      // A regex Hono can't express, so it is matched after every other admin route (in order).
      urls.push(rePath('^(?!static/)(?P<url>.*)$', this.catchAllView))
    }
    return urls
  }

  /**
   * The site's URL patterns, for `path('admin/', admin.site.urls)` (namespace = site name).
   * Built lazily, so models registered after `urls.ts` is evaluated are included.
   */
  get urls(): UrlPatterns {
    const target: UrlEntry[] = []
    return new Proxy(target, {
      get: (t, prop) => {
        if (prop === 'appName') return this.name
        // Symbol probes (e.g. include() markers) must not build the URLs before the app registry is ready.
        if (typeof prop === 'symbol' && prop !== Symbol.iterator) return Reflect.get(t, prop)
        const arr = this.builtUrls()
        const v = Reflect.get(arr, prop, arr)
        return typeof v === 'function' ? v.bind(arr) : v
      },
      has: (_t, prop) => prop === 'appName' || Reflect.has(this.builtUrls(), prop),
      ownKeys: () => Reflect.ownKeys(this.builtUrls()),
      getOwnPropertyDescriptor: (_t, prop) => {
        if (prop === 'length') return Reflect.getOwnPropertyDescriptor(target, 'length')
        const d = Reflect.getOwnPropertyDescriptor(this.builtUrls(), prop)
        return d ? { ...d, configurable: true } : undefined
      },
    }) as UrlPatterns
  }

  private builtUrls(): UrlEntry[] {
    let installed = ''
    try {
      installed = apps
        .getAppConfigs()
        .map((a) => a.appLabel)
        .join(',')
    } catch {}
    const key = `${this.version}|${installed}`
    if (this.urlCache?.key !== key) this.urlCache = { key, urls: this.getUrls() }
    return this.urlCache.urls
  }

  // ---- context & rendering ----------------------------------------------------------------------

  appVerboseName(appLabel: string): string {
    try {
      return apps.getAppConfig(appLabel).displayName
    } catch {
      return capfirst(appLabel)
    }
  }

  assets(): AdminAssets {
    const s = (setting('ADMIN_ASSETS', {}) ?? {}) as AdminAssetsSetting
    return {
      htmx: s.htmx === false || s.htmx === null ? null : (s.htmx ?? DEFAULT_HTMX_URL),
      css: s.css ?? [],
      js: s.js ?? [],
    }
  }

  /** Apps and models the user can see (Django's `get_app_list`). */
  async getAppList(c: Context, appLabel?: string): Promise<AppEntry[]> {
    const byApp = new Map<string, AppEntry>()
    for (const [model, ma] of this.registry) {
      const meta = model._meta
      if (appLabel && meta.appLabel !== appLabel) continue
      if (!(await ma.hasModulePermission(c))) continue
      const perms = await ma.getModelPerms(c)
      if (!Object.values(perms).some(Boolean)) continue
      const info = `${meta.appLabel}_${meta.modelName}`
      let app = byApp.get(meta.appLabel)
      if (!app) {
        app = {
          name: this.appVerboseName(meta.appLabel),
          appLabel: meta.appLabel,
          appUrl: this.tryReverse('app_list', { app_label: meta.appLabel }) ?? '#',
          hasModulePerms: true,
          models: [],
        }
        byApp.set(meta.appLabel, app)
      }
      app.models.push({
        model,
        name: capfirst(meta.verboseNamePlural),
        objectName: meta.objectName,
        perms,
        adminUrl: perms.change || perms.view ? this.tryReverse(`${info}_changelist`) : null,
        addUrl: perms.add ? this.tryReverse(`${info}_add`) : null,
        viewOnly: !perms.change,
      })
    }
    const list = [...byApp.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    for (const app of list) app.models.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }

  /** Variables for every admin page (Django's `each_context`). */
  async eachContext(c: Context): Promise<AdminContext> {
    const hasPermission = await this.hasPermission(c)
    let passwordChange: string | null = null
    const user = getUser(c) as any
    if (hasPermission && (typeof user.hasUsablePassword !== 'function' || user.hasUsablePassword())) {
      passwordChange = this.tryReverse('password_change')
    }
    return {
      c,
      siteName: this.name,
      siteTitle: this.siteTitle,
      siteHeader: this.siteHeader,
      siteUrl: this.siteUrl,
      indexTitle: this.indexTitle,
      user,
      hasPermission,
      availableApps: hasPermission ? await this.getAppList(c) : [],
      isNavSidebarEnabled: this.enableNavSidebar,
      messages: await consumeMessages(c),
      csrfToken: getCsrfToken(c),
      urls: {
        index: this.reverse('index'),
        logout: this.reverse('logout'),
        passwordChange,
        static: (name) => this.staticUrl(name),
      },
      assets: this.assets(),
      isPopup: false,
    }
  }

  /** Render an admin page (sets the CSRF cookie when needed). */
  async render(c: Context, node: Child, status = 200): Promise<Response> {
    getCsrfToken(c)
    setCsrfCookieIfNeeded(c)
    return render(c, node as any, { status, headers: { 'Cache-Control': NEVER_CACHE } })
  }

  databaseErrorPage(ctx: AdminContext): Child {
    return (
      <MessagePage ctx={ctx} title="Database error" breadcrumbs={[{ label: 'Home', url: ctx.urls.index }]}>
        <p>
          Something’s wrong with your database installation. Make sure the appropriate database tables have
          been created, and make sure the database is readable by the appropriate user.
        </p>
      </MessagePage>
    )
  }

  // ---- views ----------------------------------------------------------------------------------

  /** The admin home page (Django's `index`). */
  async index(c: Context): Promise<Response> {
    const ctx = await this.eachContext(c)
    const user = getUser(c)
    const entries = (await LogEntry.objects
      .filter({ user: user.pk as any })
      .selectRelated('contentType')
      .orderBy('-actionTime', '-id')
      .slice(0, 10)) as LogEntry[]
    const recent: RecentAction[] = []
    for (const e of entries) {
      let ctName = ''
      let url: string | null = null
      try {
        const ct = (await (e as any).contentType) as any
        if (ct) {
          ctName = capfirst(ct.name ?? ct.model)
          try {
            const model = apps.getModel(ct.appLabel, ct.model) as ModelClass
            ctName = capfirst(model._meta.verboseName)
            if (!e.isDeletion() && e.objectId && this.isRegistered(model)) {
              url = this.tryReverse(`${model._meta.appLabel}_${model._meta.modelName}_change`, {
                object_id: quote(e.objectId),
              })
            }
          } catch {}
        }
      } catch {}
      recent.push({
        className: e.isAddition() ? 'addlink' : e.isChange() ? 'changelink' : 'deletelink',
        repr: e.objectRepr,
        url,
        contentType: ctName,
      })
    }
    return this.render(c, <IndexPage ctx={ctx} recent={recent} />)
  }

  /** One app's models (Django's `app_index`). */
  async appIndex(c: Context): Promise<Response> {
    const appLabel = String(kwargs(c).app_label)
    const list = await this.getAppList(c, appLabel)
    if (!list.length) throw new Http404('The requested admin page does not exist.')
    const ctx = await this.eachContext(c)
    return this.render(c, <AppIndexPage ctx={ctx} appLabel={appLabel} appName={list[0].name} apps={list} />)
  }

  private safeNext(c: Context, next: string | null | undefined): string | null {
    if (!next) return null
    return isSafeRedirect(next, [getHost(c)]) ? next : null
  }

  /** Login page (Django's `login`). */
  async login(c: Context): Promise<Response> {
    const url = new URL(c.req.url)
    if (c.req.method === 'GET' && (await this.hasPermission(c))) {
      return c.redirect(this.safeNext(c, url.searchParams.get('next')) ?? this.reverse('index'), 302)
    }
    let username = ''
    let next = url.searchParams.get('next') ?? ''
    const errors: string[] = []
    let status = 200
    if (c.req.method === 'POST') {
      await enforceCsrf(c)
      const data = await c.req.formData().catch(() => new FormData())
      username = String(data.get('username') ?? '')
      const password = String(data.get('password') ?? '')
      next = String(data.get('next') ?? next)
      const userModel = getUserModel() as any
      const usernameField = userModel.USERNAME_FIELD ?? 'username'
      const user =
        username && password ? await authenticate(c, { username, [usernameField]: username, password }) : null
      if (user && (user as any).isActive && (user as any).isStaff) {
        await authLogin(c, user)
        return c.redirect(this.safeNext(c, next) ?? this.reverse('index'), 302)
      }
      const label = userModel._meta?.getForwardField?.(usernameField)?.verboseName ?? 'username'
      errors.push(
        `Please enter the correct ${label} and password for a staff account. Note that both fields may be case-sensitive.`,
      )
      status = 200
    } else if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } })
    }
    const ctx = await this.eachContext(c)
    const current = getUser(c) as any
    const authenticatedNotStaff =
      current.isAuthenticated && !(await this.hasPermission(c))
        ? String(
            typeof current.getUsername === 'function'
              ? current.getUsername()
              : (current.username ?? current.pk),
          )
        : null
    const userModel = getUserModel() as any
    const usernameField = userModel.USERNAME_FIELD ?? 'username'
    const label = capfirst(userModel._meta?.getForwardField?.(usernameField)?.verboseName ?? 'username')
    return this.render(
      c,
      <LoginPage
        ctx={{ ...ctx, siteHeader: this.siteHeader }}
        action={`${url.pathname}${url.search}`}
        next={next || this.reverse('index')}
        username={username}
        usernameLabel={label}
        errors={errors}
        authenticatedNotStaff={authenticatedNotStaff}
        passwordResetUrl={null}
      />,
      status,
    )
  }

  /** Log out (POST only, like Django 5) and show the "logged out" page. */
  async logout(c: Context): Promise<Response> {
    if (c.req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
    }
    await authLogout(c)
    const ctx = await this.eachContext(c)
    return this.render(c, <LoggedOutPage ctx={ctx} loginUrl={this.reverse('index')} />)
  }

  /** Change the current user's password (Django's `password_change`). */
  async passwordChange(c: Context): Promise<Response> {
    const user = getUser(c) as any
    const errors: Record<string, string[]> = { old_password: [], new_password1: [], new_password2: [] }
    if (c.req.method === 'POST') {
      const data = await c.req.formData().catch(() => new FormData())
      const old = String(data.get('old_password') ?? '')
      const p1 = String(data.get('new_password1') ?? '')
      const p2 = String(data.get('new_password2') ?? '')
      if (!old) errors.old_password.push('This field is required.')
      if (!p1) errors.new_password1.push('This field is required.')
      if (!p2) errors.new_password2.push('This field is required.')
      if (old && !(await user.checkPassword(old))) {
        errors.old_password.push('Your old password was entered incorrectly. Please enter it again.')
      }
      if (p1 && p2 && p1 !== p2) errors.new_password2.push('The two password fields didn’t match.')
      if (p1 && p2 && p1 === p2) {
        try {
          await validatePassword(p2, user)
        } catch (e) {
          if (e instanceof ValidationError) errors.new_password2.push(...e.messages)
          else throw e
        }
      }
      if (!Object.values(errors).some((e) => e.length)) {
        await user.setPassword(p1)
        await user.save()
        await updateSessionAuthHash(c, user)
        return c.redirect(this.reverse('password_change_done'), 302)
      }
    }
    const ctx = await this.eachContext(c)
    const help = passwordValidatorsHelpTexts()
    return this.render(
      c,
      <PasswordFormPage
        ctx={ctx}
        title="Password change"
        breadcrumbs={[{ label: 'Home', url: ctx.urls.index }, { label: 'Password change' }]}
        action={this.reverse('password_change')}
        intro="Please enter your old password, for security’s sake, and then enter your new password twice so we can verify you typed it in correctly."
        fields={[
          {
            name: 'old_password',
            label: 'Old password',
            errors: errors.old_password,
            autocomplete: 'current-password',
          },
          {
            name: 'new_password1',
            label: 'New password',
            errors: errors.new_password1,
            autocomplete: 'new-password',
            help: help.length ? (
              <ul>
                {help.map((h) => (
                  <li>{h}</li>
                ))}
              </ul>
            ) : undefined,
          },
          {
            name: 'new_password2',
            label: 'New password confirmation',
            errors: errors.new_password2,
            autocomplete: 'new-password',
          },
        ]}
        nonFieldErrors={[]}
        submitLabel="Change my password"
        bodyClass="password-change"
      />,
    )
  }

  async passwordChangeDone(c: Context): Promise<Response> {
    const ctx = await this.eachContext(c)
    return this.render(
      c,
      <MessagePage
        ctx={ctx}
        title="Password change successful"
        breadcrumbs={[{ label: 'Home', url: ctx.urls.index }, { label: 'Password change' }]}
      >
        <p>Your password was changed.</p>
      </MessagePage>,
    )
  }

  /**
   * JSON search endpoint for `autocompleteFields` (Django's AutocompleteJsonView):
   * `?app_label=&model_name=&field_name=&term=&page=` → `{ results: [{ id, text }], pagination: { more } }`.
   * Requests sent by htmx (`HX-Request`) get an HTML fragment instead.
   */
  async autocompleteView(c: Context): Promise<Response> {
    const p = new URL(c.req.url).searchParams
    const term = p.get('term') ?? ''
    const appLabel = p.get('app_label') ?? ''
    const modelName = p.get('model_name') ?? ''
    const fieldName = p.get('field_name') ?? ''
    let sourceModel: ModelClass
    try {
      sourceModel = apps.getModel(appLabel, modelName) as ModelClass
    } catch {
      throw new PermissionDenied()
    }
    const sourceAdmin = this.getModelAdmin(sourceModel)
    if (!sourceAdmin) throw new PermissionDenied()
    const sourceField = sourceModel._meta.getForwardField(fieldName) as any
    if (!sourceField?.isRelation) throw new PermissionDenied()
    const inlineHasField = sourceAdmin.getAutocompleteFields(c).includes(fieldName)
    if (!inlineHasField && !(await this.inlineAutocompletes(c, sourceModel, fieldName)))
      throw new PermissionDenied()
    const remote = sourceField.relatedModel as ModelClass
    const modelAdmin = this.getModelAdmin(remote)
    if (!modelAdmin) throw new PermissionDenied()
    if (!modelAdmin.getSearchFields(c).length) {
      throw new Http404(`${modelAdmin.constructor.name} must have searchFields for the autocomplete view.`)
    }
    if (!(await modelAdmin.hasViewOrChangePermission(c))) throw new PermissionDenied()
    let qs = modelAdmin.getQueryset(c)
    const limit = sourceField.limitChoicesTo
    if (limit) qs = qs.filter(limit)
    ;[qs] = await modelAdmin.getSearchResults(c, qs, term)
    if (!modelAdmin.getOrdering(c).length && !(remote._meta.ordering ?? []).length)
      qs = qs.orderBy(remote._meta.pk.name)
    const page = Math.max(1, Number.parseInt(p.get('page') ?? '1', 10) || 1)
    const perPage = 20
    const objs = (await qs.slice((page - 1) * perPage, page * perPage + 1)) as BaseModel[]
    const more = objs.length > perPage
    const results = objs.slice(0, perPage).map((o) => ({
      id: String((o as any)[sourceField.targetField?.attname ?? 'pk'] ?? o.pk),
      text: objectRepr(o),
    }))
    if (c.req.header('hx-request')) {
      return this.render(
        c,
        <ul class="autocomplete-list">
          {results.length ? (
            results.map((r) => (
              <li>
                <a href="#" data-autocomplete-id={r.id}>
                  {r.text}
                </a>
              </li>
            ))
          ) : (
            <li class="quiet">No results found</li>
          )}
        </ul>,
      )
    }
    return json(c, { results, pagination: { more } })
  }

  private async inlineAutocompletes(c: Context, model: ModelClass, fieldName: string): Promise<boolean> {
    for (const [, ma] of this.registry) {
      for (const cls of ma.inlines) {
        const inline = new cls(ma.model, this)
        if (inline.model === model && inline.getAutocompleteFields(c).includes(fieldName)) return true
      }
    }
    return false
  }

  /** Serves `admin.css` / `admin.js` (long cache; URLs carry the version). */
  staticView(c: Context): Response {
    const name = String(kwargs(c).path) as keyof typeof ASSET_ETAGS
    const body = name === 'admin.css' ? ADMIN_CSS : name === 'admin.js' ? ADMIN_JS : null
    if (body === null) throw new Http404()
    const etag = ASSET_ETAGS[name]
    const headers = {
      'Content-Type': name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
    }
    if (c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers })
    return new Response(c.req.method === 'HEAD' ? null : body, { headers })
  }

  /** Unknown admin URLs: append slash, send anonymous users to the login page, else 404. */
  async catchAll(c: Context): Promise<Response> {
    const url = new URL(c.req.url)
    if (!url.pathname.endsWith('/')) {
      try {
        const m = resolve(`${url.pathname}/`)
        if (m.view !== this.catchAllView) return c.redirect(`${url.pathname}/${url.search}`, 301)
      } catch {}
    }
    if (!(await this.hasPermission(c))) {
      return c.redirect(
        `${this.reverse('login')}?${new URLSearchParams({ next: url.pathname + url.search })}`,
        302,
      )
    }
    throw new Http404('The requested admin page does not exist.')
  }

  /** Render a simple page with the admin chrome (for custom views). */
  async renderPage(
    c: Context,
    title: string,
    content: Child,
    opts: { breadcrumbs?: Array<{ label: string; url?: string | null }> } = {},
  ): Promise<Response> {
    const ctx = await this.eachContext(c)
    return this.render(
      c,
      <Page
        ctx={ctx}
        title={title}
        breadcrumbs={opts.breadcrumbs ?? [{ label: 'Home', url: ctx.urls.index }, { label: title }]}
      >
        {content}
      </Page>,
    )
  }
}

/** The default admin site. */
const SITE_KEY = Symbol.for('ghuri.admin.site')
if (!(globalThis as any)[SITE_KEY]) (globalThis as any)[SITE_KEY] = new AdminSite()
export const site: AdminSite = (globalThis as any)[SITE_KEY]

/**
 * Class decorator registering a ModelAdmin (Django's `@admin.register`):
 * `@register(Post) class PostAdmin extends ModelAdmin<Post> {}`; `@register(Post, { site: mySite })`.
 * Works with TC39 and legacy (`experimentalDecorators`) decorators, or as a call: `register(Post)(PostAdmin)`.
 */
export function register(...args: Array<ModelClass | ModelClass[] | { site?: AdminSite } | unknown>) {
  let target: AdminSite = site
  const models: ModelClass[] = []
  for (const a of args) {
    if (Array.isArray(a)) models.push(...(a as ModelClass[]))
    else if (a && typeof a === 'object' && 'site' in (a as object) && (a as any).site instanceof AdminSite)
      target = (a as any).site
    else if (a) models.push(a as ModelClass)
  }
  if (!models.length) throw new ImproperlyConfigured('At least one model must be passed to register.')
  return <T extends ModelAdminClass>(cls: T, _context?: unknown): T => {
    if (!(cls.prototype instanceof ModelAdmin) && (cls as unknown) !== ModelAdmin) {
      throw new ImproperlyConfigured('Wrapped class must subclass ModelAdmin.')
    }
    target.register(models, cls)
    return cls
  }
}
