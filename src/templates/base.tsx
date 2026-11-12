// Base layout (Django's admin/base.html + base_site.html).
import type { RequestUser } from '@ghuri/core'
import type { Context } from 'hono'
import type { Child } from 'hono/jsx'
import type { Message } from '../messages'

export interface ModelEntry {
  model: unknown
  name: string
  objectName: string
  perms: { add: boolean; change: boolean; delete: boolean; view: boolean }
  adminUrl: string | null
  addUrl: string | null
  viewOnly: boolean
}

export interface AppEntry {
  name: string
  appLabel: string
  appUrl: string
  hasModulePerms: boolean
  models: ModelEntry[]
}

export interface AdminAssets {
  htmx: string | null
  css: string[]
  js: string[]
}

/** What every admin page gets (Django's `each_context`). */
export interface AdminContext {
  c: Context
  siteName: string
  siteTitle: string
  siteHeader: string
  siteUrl: string | null
  indexTitle: string
  user: RequestUser
  hasPermission: boolean
  availableApps: AppEntry[]
  isNavSidebarEnabled: boolean
  messages: Message[]
  csrfToken: string
  urls: {
    index: string
    logout: string
    passwordChange: string | null
    static: (name: string) => string
  }
  assets: AdminAssets
  isPopup: boolean
}

export interface Crumb {
  label: string
  url?: string | null
}

export interface PageProps {
  ctx: AdminContext
  title: string
  /** `<h1>` text (defaults to the title; `null` hides it). */
  heading?: string | null
  subtitle?: string | null
  bodyClass?: string
  breadcrumbs?: Crumb[] | null
  contentClass?: string
  /** Show the app/model sidebar (changelist, change form). */
  navSidebar?: boolean
  currentModel?: unknown
  children?: Child
  /** Hide the user tools (login/logout pages). */
  hideUserTools?: boolean
  extraHead?: Child
}

export const CsrfInput = ({ token }: { token: string }) => (
  <input type="hidden" name="csrfmiddlewaretoken" value={token} />
)

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumbs">
      <div class="breadcrumbs">
        {crumbs.map((c, i) => (
          <>
            {i > 0 ? ' › ' : ''}
            {c.url ? <a href={c.url}>{c.label}</a> : c.label}
          </>
        ))}
      </div>
    </nav>
  )
}

export function MessageList({ messages }: { messages: Message[] }) {
  if (!messages.length) return null
  return (
    <ul class="messagelist">
      {messages.map((m) => (
        <li class={m.tags}>{m.message}</li>
      ))}
    </ul>
  )
}

function UserTools({ ctx }: { ctx: AdminContext }) {
  const u = ctx.user as any
  if (!u?.isAuthenticated || !ctx.hasPermission) return null
  const name =
    (typeof u.getShortName === 'function' && u.getShortName()) ||
    (typeof u.getUsername === 'function' && u.getUsername()) ||
    u.username ||
    String(u.pk)
  return (
    <div id="user-tools">
      Welcome, <strong>{name}</strong>.{' '}
      {ctx.siteUrl ? (
        <>
          <a href={ctx.siteUrl}>View site</a> /{' '}
        </>
      ) : null}
      {ctx.urls.passwordChange ? (
        <>
          <a href={ctx.urls.passwordChange}>Change password</a> /{' '}
        </>
      ) : null}
      <form id="logout-form" method="post" action={ctx.urls.logout}>
        <CsrfInput token={ctx.csrfToken} />
        <button type="submit">Log out</button>
      </form>
    </div>
  )
}

/** The app list (index page, app index, nav sidebar). */
export function AppList({
  apps,
  showChangeLinks = true,
  currentModel,
  currentApp,
}: {
  apps: AppEntry[]
  showChangeLinks?: boolean
  currentModel?: unknown
  currentApp?: string
}) {
  if (!apps.length) return <p>You don’t have permission to view or edit anything.</p>
  return (
    <>
      {apps.map((app) => (
        <div class={`app-${app.appLabel} module${app.appLabel === currentApp ? ' current-app' : ''}`}>
          <table>
            <caption>
              <a href={app.appUrl} class="section" title={`Models in the ${app.name} application`}>
                {app.name}
              </a>
            </caption>
            <thead class="visually-hidden">
              <tr>
                <th scope="col">Model name</th>
                <th scope="col">Add link</th>
                {showChangeLinks ? <th scope="col">Change or view list link</th> : null}
              </tr>
            </thead>
            <tbody>
              {app.models.map((m) => (
                <tr
                  class={`model-${m.objectName.toLowerCase()}${m.model === currentModel ? ' current-model' : ''}`}
                >
                  <th scope="row" id={`${app.appLabel}-${m.objectName.toLowerCase()}`}>
                    {m.adminUrl ? (
                      <a href={m.adminUrl} aria-current={m.model === currentModel ? 'page' : undefined}>
                        {m.name}
                      </a>
                    ) : (
                      m.name
                    )}
                  </th>
                  <td>
                    {m.addUrl ? (
                      <a href={m.addUrl} class="addlink">
                        Add
                      </a>
                    ) : null}
                  </td>
                  {showChangeLinks ? (
                    <td>
                      {m.adminUrl ? (
                        m.viewOnly ? (
                          <a href={m.adminUrl} class="viewlink">
                            View
                          </a>
                        ) : (
                          <a href={m.adminUrl} class="changelink">
                            Change
                          </a>
                        )
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

function NavSidebar({ ctx, currentModel }: { ctx: AdminContext; currentModel?: unknown }) {
  return (
    <>
      <button
        class="sticky toggle-nav-sidebar"
        id="toggle-nav-sidebar"
        aria-label="Toggle navigation"
        type="button"
      ></button>
      <nav class="sticky" id="nav-sidebar" aria-label="Sidebar">
        <input
          type="search"
          id="nav-filter"
          class="hidden"
          placeholder="Start typing to filter…"
          aria-label="Filter navigation items"
        />
        <AppList apps={ctx.availableApps} showChangeLinks={false} currentModel={currentModel} />
      </nav>
    </>
  )
}

/** Full admin page. */
export function Page(props: PageProps) {
  const { ctx } = props
  const heading = props.heading === undefined ? props.title : props.heading
  const withSidebar = props.navSidebar && ctx.isNavSidebarEnabled && ctx.hasPermission && !ctx.isPopup
  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charset="utf-8" />
        <title>
          {props.title} | {ctx.siteTitle}
        </title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="NONE,NOARCHIVE" />
        <meta name="color-scheme" content="light dark" />
        <link rel="stylesheet" href={ctx.urls.static('admin.css')} />
        {ctx.assets.css.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
        <script src={ctx.urls.static('admin.js')} defer></script>
        {ctx.assets.htmx ? <script src={ctx.assets.htmx} defer></script> : null}
        {ctx.assets.js.map((src) => (
          <script src={src} defer></script>
        ))}
        {props.extraHead}
      </head>
      <body class={props.bodyClass ?? ''} data-admin-utc-offset="0">
        <a href="#content-start" class="skip-to-content-link">
          Skip to main content
        </a>
        <div id="container">
          <header id="header">
            <div id="branding">
              <div id="site-name">
                <a href={ctx.urls.index}>{ctx.siteHeader}</a>
              </div>
            </div>
            {props.hideUserTools ? null : <UserTools ctx={ctx} />}
          </header>
          {props.breadcrumbs ? <Breadcrumbs crumbs={props.breadcrumbs} /> : null}
          <div class={`main${withSidebar ? ' shifted' : ''}`} id="main">
            {withSidebar ? <NavSidebar ctx={ctx} currentModel={props.currentModel} /> : null}
            <main id="content-start" class="content" tabindex={-1}>
              <MessageList messages={ctx.messages} />
              <div id="content" class={props.contentClass ?? 'colM'}>
                {heading ? <h1>{heading}</h1> : null}
                {props.subtitle ? <h2>{props.subtitle}</h2> : null}
                {props.children}
                <br class="clear" />
              </div>
              <footer id="footer"></footer>
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
