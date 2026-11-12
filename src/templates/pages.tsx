// Index, app index, login/logout, password change, delete confirmations and history pages.
import type { Child } from 'hono/jsx'
import { type AdminContext, AppList, type Crumb, CsrfInput, Page } from './base'
import { Fieldset, type FieldsetView } from './changeform'
import { ErrorList } from './widgets'

export interface RecentAction {
  className: 'addlink' | 'changelink' | 'deletelink'
  repr: string
  url: string | null
  contentType: string
}

export function IndexPage({ ctx, recent }: { ctx: AdminContext; recent: RecentAction[] }) {
  return (
    <Page ctx={ctx} title={ctx.indexTitle} bodyClass="dashboard" contentClass="colMS">
      <div id="content-main">
        <AppList apps={ctx.availableApps} />
      </div>
      <div id="content-related">
        <div class="module" id="recent-actions-module">
          <h2>Recent actions</h2>
          <h3>My actions</h3>
          {recent.length ? (
            <ul class="actionlist">
              {recent.map((a) => (
                <li class={a.className}>
                  <span class="visually-hidden">
                    {a.className === 'addlink'
                      ? 'Added:'
                      : a.className === 'changelink'
                        ? 'Changed:'
                        : 'Deleted:'}
                  </span>
                  {a.url ? <a href={a.url}>{a.repr}</a> : a.repr}
                  <br />
                  <span class="mini quiet">{a.contentType || 'Unknown content'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>None available</p>
          )}
        </div>
      </div>
    </Page>
  )
}

export function AppIndexPage({
  ctx,
  appLabel,
  appName,
  apps,
}: {
  ctx: AdminContext
  appLabel: string
  appName: string
  apps: AdminContext['availableApps']
}) {
  return (
    <Page
      ctx={ctx}
      title={`${appName} administration`}
      bodyClass={`app-${appLabel} dashboard`}
      breadcrumbs={[{ label: 'Home', url: ctx.urls.index }, { label: appName }]}
      navSidebar
    >
      <div id="content-main">
        <AppList apps={apps} currentApp={appLabel} />
      </div>
    </Page>
  )
}

export interface LoginPageProps {
  ctx: AdminContext
  action: string
  next: string
  username: string
  usernameLabel: string
  errors: string[]
  authenticatedNotStaff: string | null
  passwordResetUrl: string | null
}

export function LoginPage(p: LoginPageProps) {
  return (
    <Page ctx={p.ctx} title="Log in" heading={null} bodyClass="login" hideUserTools contentClass="colM">
      {p.errors.length ? (
        <p class="errornote">
          {p.errors.length === 1 ? 'Please correct the error below.' : 'Please correct the errors below.'}
        </p>
      ) : null}
      <ErrorList errors={p.errors} nonfield />
      {p.authenticatedNotStaff ? (
        <p class="errornote">
          You are authenticated as {p.authenticatedNotStaff}, but are not authorized to access this page.
          Would you like to login to a different account?
        </p>
      ) : null}
      <div id="content-main">
        <form action={p.action} method="post" id="login-form">
          <CsrfInput token={p.ctx.csrfToken} />
          <div class="form-row">
            <label class="required" for="id_username">
              {p.usernameLabel}:
            </label>
            <input
              type="text"
              name="username"
              autofocus
              autocapitalize="none"
              autocomplete="username"
              maxlength={150}
              required
              id="id_username"
              value={p.username}
            />
          </div>
          <div class="form-row">
            <label class="required" for="id_password">
              Password:
            </label>
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              required
              id="id_password"
            />
            <input type="hidden" name="next" value={p.next} />
          </div>
          {p.passwordResetUrl ? (
            <div class="password-reset-link">
              <a href={p.passwordResetUrl}>Forgotten your password or username?</a>
            </div>
          ) : null}
          <div class="submit-row">
            <input type="submit" value="Log in" />
          </div>
        </form>
      </div>
    </Page>
  )
}

export function LoggedOutPage({ ctx, loginUrl }: { ctx: AdminContext; loginUrl: string }) {
  return (
    <Page ctx={ctx} title="Logged out" heading={null} breadcrumbs={[{ label: 'Home', url: ctx.urls.index }]}>
      <p>Thanks for spending some quality time with the web site today.</p>
      <p>
        <a href={loginUrl}>Log in again</a>
      </p>
    </Page>
  )
}

export interface PasswordFormProps {
  ctx: AdminContext
  title: string
  breadcrumbs: Crumb[]
  action: string
  intro: Child
  fields: Array<{ name: string; label: string; errors: string[]; help?: Child; autocomplete: string }>
  nonFieldErrors: string[]
  submitLabel: string
  bodyClass?: string
}

export function PasswordFormPage(p: PasswordFormProps) {
  const errorCount = p.nonFieldErrors.length + p.fields.reduce((n, f) => n + (f.errors.length ? 1 : 0), 0)
  return (
    <Page ctx={p.ctx} title={p.title} breadcrumbs={p.breadcrumbs} bodyClass={p.bodyClass}>
      <div id="content-main">
        <form method="post" action={p.action} novalidate>
          <CsrfInput token={p.ctx.csrfToken} />
          <div>
            {errorCount ? (
              <p class="errornote">
                {errorCount === 1 ? 'Please correct the error below.' : 'Please correct the errors below.'}
              </p>
            ) : null}
            <ErrorList errors={p.nonFieldErrors} nonfield />
            <p>{p.intro}</p>
            <fieldset class="module aligned wide">
              {p.fields.map((f) => (
                <div class={`form-row${f.errors.length ? ' errors' : ''}`}>
                  <ErrorList errors={f.errors} />
                  <div class="flex-container">
                    <label for={`id_${f.name}`} class="required">
                      {f.label}:
                    </label>
                    <input
                      type="password"
                      name={f.name}
                      autocomplete={f.autocomplete}
                      required
                      id={`id_${f.name}`}
                    />
                  </div>
                  {f.help ? <div class="help">{f.help}</div> : null}
                </div>
              ))}
            </fieldset>
            <div class="submit-row">
              <input type="submit" value={p.submitLabel} class="default" />
            </div>
          </div>
        </form>
      </div>
    </Page>
  )
}

export function MessagePage({
  ctx,
  title,
  breadcrumbs,
  children,
}: {
  ctx: AdminContext
  title: string
  breadcrumbs: Crumb[]
  children?: Child
}) {
  return (
    <Page ctx={ctx} title={title} breadcrumbs={breadcrumbs}>
      {children}
    </Page>
  )
}

/** Nested list of objects to delete (Django's `unordered_list`). */
export type DeletedTree = Array<{ label: Child; children: DeletedTree }>

export function NestedList({ items }: { items: DeletedTree }) {
  return (
    <>
      {items.map((it) => (
        <li>
          {it.label}
          {it.children.length ? (
            <ul>
              <NestedList items={it.children} />
            </ul>
          ) : null}
        </li>
      ))}
    </>
  )
}

export interface DeleteConfirmationProps {
  ctx: AdminContext
  title: string
  breadcrumbs: Crumb[]
  bodyClass: string
  objectName: string
  objectRepr: string
  deletedObjects: DeletedTree
  modelCount: Array<[string, number]>
  permsLacking: string[]
  protectedObjects: Child[]
  hidden: Array<[string, string]>
  action: string
  cancelUrl: string
  /** Bulk delete (delete_selected). */
  bulk?: boolean
  currentModel?: unknown
}

export function DeleteConfirmationPage(p: DeleteConfirmationProps) {
  const what = p.bulk ? `the selected ${p.objectName}` : `the ${p.objectName} “${p.objectRepr}”`
  let body: Child
  if (p.permsLacking.length) {
    body = (
      <>
        <p>
          {p.bulk
            ? `Deleting the selected ${p.objectName} would result in deleting related objects, but your account doesn't have permission to delete the following types of objects:`
            : `Deleting ${what} would result in deleting related objects, but your account doesn't have permission to delete the following types of objects:`}
        </p>
        <h2>Objects</h2>
        <ul id="deleted-objects">
          {p.permsLacking.map((x) => (
            <li>{x}</li>
          ))}
        </ul>
      </>
    )
  } else if (p.protectedObjects.length) {
    body = (
      <>
        <p>
          {p.bulk
            ? `Deleting the selected ${p.objectName} would require deleting the following protected related objects:`
            : `Deleting ${what} would require deleting the following protected related objects:`}
        </p>
        <ul>
          {p.protectedObjects.map((x) => (
            <li>{x}</li>
          ))}
        </ul>
      </>
    )
  } else {
    body = (
      <>
        <p>
          {p.bulk
            ? `Are you sure you want to delete the selected ${p.objectName}? All of the following objects and their related items will be deleted:`
            : `Are you sure you want to delete ${what}? All of the following related items will be deleted:`}
        </p>
        <h2>Summary</h2>
        <ul>
          {p.modelCount.map(([name, count]) => (
            <li>
              {name}: {count}
            </li>
          ))}
        </ul>
        <h2>Objects</h2>
        <ul id="deleted-objects">
          <NestedList items={p.deletedObjects} />
        </ul>
        <form method="post" action={p.action}>
          <CsrfInput token={p.ctx.csrfToken} />
          <div>
            {p.hidden.map(([k, v]) => (
              <input type="hidden" name={k} value={v} />
            ))}
            <input type="hidden" name="post" value="yes" />
            <input type="submit" value="Yes, I’m sure" />{' '}
            <a href={p.cancelUrl} class="button cancel-link">
              No, take me back
            </a>
          </div>
        </form>
      </>
    )
  }
  return (
    <Page
      ctx={p.ctx}
      title={p.title}
      bodyClass={p.bodyClass}
      breadcrumbs={p.breadcrumbs}
      navSidebar
      currentModel={p.currentModel}
    >
      <div class="delete-confirmation">{body}</div>
    </Page>
  )
}

export interface HistoryEntry {
  time: string
  isoTime: string
  user: string
  message: string
}

export function HistoryPage({
  ctx,
  title,
  subtitle,
  breadcrumbs,
  bodyClass,
  entries,
  currentModel,
}: {
  ctx: AdminContext
  title: string
  subtitle: string
  breadcrumbs: Crumb[]
  bodyClass: string
  entries: HistoryEntry[]
  currentModel?: unknown
}) {
  return (
    <Page
      ctx={ctx}
      title={title}
      subtitle={subtitle}
      breadcrumbs={breadcrumbs}
      bodyClass={bodyClass}
      navSidebar
      currentModel={currentModel}
    >
      <div id="content-main">
        <div id="change-history" class="module">
          {entries.length ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">Date/time</th>
                  <th scope="col">User</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr>
                    <th scope="row">
                      <time datetime={e.isoTime}>{e.time}</time>
                    </th>
                    <td>{e.user}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>This object doesn’t have a change history. It probably wasn’t added via this admin site.</p>
          )}
        </div>
      </div>
    </Page>
  )
}

export function ReadonlyFieldsets({ fieldsets }: { fieldsets: FieldsetView[] }) {
  return (
    <>
      {fieldsets.map((fs) => (
        <Fieldset fs={fs} />
      ))}
    </>
  )
}
