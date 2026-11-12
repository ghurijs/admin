# @ghuri/admin

The Django admin for [Ghuri](https://github.com/ghurijs/ghuri) — Django for TypeScript, Cloudflare first.

Register a model and get a complete back office: login, an index of your apps, searchable/filterable/sortable
change lists with bulk actions, add/change forms with fieldsets and inlines, delete confirmations that list
cascaded objects, object history, user and group management. Server-rendered with `hono/jsx`, styled like
Django's admin (light and dark), progressively enhanced with a little JavaScript and htmx. Runs on Cloudflare
Workers (D1, R2) and on Node (Postgres, SQLite) with the same code.

> Status: alpha (`0.1.0-alpha.0`). APIs may change.

```bash
npm install @ghuri/admin@next
```

## Contents

- [Setup](#setup)
- [Registering models](#registering-models)
- [ModelAdmin options](#modeladmin-options)
- [Columns: `display()`](#columns-display)
- [Filters](#filters)
- [Actions](#actions)
- [Inlines](#inlines)
- [Forms and widgets](#forms-and-widgets)
- [Hooks](#hooks)
- [Permissions](#permissions)
- [Custom admin views](#custom-admin-views)
- [Customizing the site](#customizing-the-site)
- [Users and groups](#users-and-groups)
- [URL names](#url-names)
- [Assets, JavaScript and htmx](#assets-javascript-and-htmx)
- [Security](#security)
- [Testing](#testing)
- [Differences from Django](#differences-from-django)

## Setup

```ts
// src/settings.ts
import { AdminConfig } from '@ghuri/admin'
import {
  AuthConfig, AuthenticationMiddleware, ContentTypesConfig, SessionMiddleware, SessionsConfig,
} from '@ghuri/auth'
import { CommonMiddleware, CsrfMiddleware, defineSettings, SecurityMiddleware } from '@ghuri/core'
import { d1 } from '@ghuri/orm'
import { BlogConfig } from './blog/app'
import { urlpatterns } from './urls'

export default defineSettings((env) => ({
  SECRET_KEY: env.SECRET_KEY,
  INSTALLED_APPS: [ContentTypesConfig, AuthConfig, SessionsConfig, AdminConfig, BlogConfig],
  MIDDLEWARE: [SecurityMiddleware, SessionMiddleware, CommonMiddleware, CsrfMiddleware, AuthenticationMiddleware],
  ROOT_URLCONF: urlpatterns,
  DATABASES: { default: d1('DB') },
}))
```

```ts
// src/urls.ts
import { admin } from '@ghuri/admin'
import { path } from '@ghuri/core'

export const urlpatterns = [path('admin/', admin.site.urls)]
```

Then `ghuri migrate` (the admin ships its migration for `LogEntry`, table `django_admin_log`) and
`ghuri createsuperuser`. Open `/admin/`.

Requirements, like Django:

| | Why |
|---|---|
| `ContentTypesConfig`, `AuthConfig` | permissions, users, `LogEntry` relations (checked at startup) |
| `SessionsConfig` + `SessionMiddleware` (any `SESSION_ENGINE`) | login sessions and flash messages |
| `AuthenticationMiddleware` | the request user |
| `CsrfMiddleware` (recommended) | the admin also checks CSRF itself on every POST |
| `STORAGES` (optional, `@ghuri/storage`) | `FileField` / `ImageField` uploads |

Only active staff users (`isActive && isStaff`) can use the admin; superusers see everything, other staff
see what their permissions allow.

## Registering models

```ts
// src/blog/admin.ts
import { admin, ModelAdmin } from '@ghuri/admin'
import { Category, Post, Tag } from './models'

@admin.register(Post)
export class PostAdmin extends ModelAdmin<Post> {
  listDisplay = ['title', 'author', 'published', 'createdAt']
  listFilter = ['published', 'createdAt']
  searchFields = ['title', 'body']
}

admin.site.register(Category)                 // default ModelAdmin
admin.site.register([Tag], TagAdmin)          // several models, one admin class
```

```ts
// src/blog/app.ts — importing the module registers the admins ("autodiscovery")
import * as admin from './admin'
export class BlogConfig extends AppConfig { name = 'blog'; models = models; admin = admin }
```

`@admin.register(Model, ...)` works with standard (TC39) decorators and with `experimentalDecorators`; without
decorators call it: `admin.register(Post)(PostAdmin)` or `admin.site.register(Post, PostAdmin)`.
`admin.site.unregister(Model)` and `admin.site.isRegistered(Model)` work like Django's; registering twice
throws `AlreadyRegistered`, unregistering an unknown model `NotRegistered`.

`admin` mirrors `django.contrib.admin`: `admin.site`, `admin.register`, `admin.ModelAdmin`,
`admin.TabularInline`, `admin.StackedInline`, `admin.display`, `admin.action`, `admin.SimpleListFilter`, the
field filters, `admin.AdminSite`, `admin.HORIZONTAL` / `admin.VERTICAL`. Everything is also a named export.

## ModelAdmin options

Options are class fields (Django's `snake_case` → `camelCase`).

### Change list

| Option | Default | |
|---|---|---|
| `listDisplay` | `['__str__']` | Columns: field names, `'author__username'` paths, `ModelAdmin` method names, model method names, or functions. |
| `listDisplayLinks` | first column | Columns linking to the change form; `null` for none. |
| `listFilter` | `[]` | Field names (`'published'`, `'author__isStaff'`), `SimpleListFilter` classes, or `['field', FilterClass]`. |
| `listSelectRelated` | `false` | `true` (all FKs), field names, or `false` (FKs shown in `listDisplay`). |
| `listPerPage` / `listMaxShowAll` | `100` / `200` | Pagination and the "Show all" limit. |
| `listEditable` | `[]` | Fields edited in place on the change list (saved with one "Save" button). |
| `searchFields` | `[]` | `'title'` (icontains), `'^slug'` (istartswith), `'=email'` (iexact), `'@body'` (icontains), `'author__username'`. Words are ANDed, fields ORed; `"quoted phrases"` stay together. |
| `searchHelpText` | `null` | Text under the search box. |
| `dateHierarchy` | `null` | A date/datetime field: year → month → day drill-down links. |
| `ordering` | model `Meta.ordering` | Default ordering (the pk is appended for a stable order). |
| `sortableBy` | all | Restrict sortable columns. |
| `showFullResultCount` | `true` | Show "N results (M total)" when filtered (`false` saves a COUNT). |
| `actions` | `[]` | Extra actions (plus the site's `delete_selected`); `null` disables actions. |
| `actionsOnTop` / `actionsOnBottom` / `actionsSelectionCounter` | `true` / `false` / `true` | |
| `emptyValueDisplay` | site's `'-'` | Shown for empty values. |
| `preserveFilters` | `true` | Keep the change list filters across add/change/delete. |

Sorting uses Django's `?o=` parameter (`?o=2.-1`: column 2 ascending, then column 1 descending); headers show the
sort priority with toggle/remove links.

```ts
class PostAdmin extends ModelAdmin<Post> {
  listDisplay = ['title', 'author', 'status', 'wordCount']
  listDisplayLinks = ['title']
  listFilter = ['status', 'author', 'createdAt', DecadeFilter, ['category', RelatedOnlyFieldListFilter]]
  listSelectRelated = ['author']
  searchFields = ['^title', 'body', 'author__username']
  dateHierarchy = 'createdAt'
  ordering = ['-createdAt']
  listPerPage = 50
  listEditable = ['status']
}
```

### Forms

| Option | Default | |
|---|---|---|
| `fields` | all editable fields | Field names; nest an array to put fields on one line: `['title', ['slug', 'status']]`. |
| `exclude` | `null` | Fields left off the form. |
| `fieldsets` | one unnamed fieldset | `[[name \| null, { fields, classes?, description? }], …]`; `classes: ['collapse']` renders a `<details>`, `['wide']` widens labels. |
| `readonlyFields` | `[]` | Field names, method names or functions, shown as text (also non-editable fields like `autoNowAdd`). |
| `prepopulatedFields` | `{}` | `{ slug: ['title'] }`: slugified as you type (JavaScript), on new and empty fields. |
| `rawIdFields` | `[]` | FK / M2M as an id input with a lookup link (comma-separated ids for M2M). |
| `autocompleteFields` | `[]` | FK / M2M with search-as-you-type (htmx); the related model's admin needs `searchFields`. |
| `filterHorizontal` / `filterVertical` | `[]` | M2M as a filterable multi-select. |
| `radioFields` | `{}` | `{ status: HORIZONTAL }`: choices / FK as radio buttons. |
| `formfieldOverrides` | `{}` | Per field type: `{ TextField: { widget: 'text', attrs: { size: 80 } } }`. |
| `saveAs` / `saveAsContinue` | `false` / `true` | "Save as new" button. |
| `saveOnTop` | `false` | Buttons above the form too. |
| `viewOnSite` | `true` | "View on site" uses `obj.getAbsoluteUrl()`; or a function `(obj) => url`. |
| `inlines` | `[]` | Inline classes (see below). |

```ts
class PostAdmin extends ModelAdmin<Post> {
  fieldsets = [
    [null, { fields: ['title', 'slug', 'body'] }],
    ['Publishing', { fields: [['published', 'publishedAt'], 'author', 'tags'], classes: ['collapse'],
                     description: 'Visible on the site once published.' }],
  ]
  readonlyFields = ['createdAt', 'wordCount']
  prepopulatedFields = { slug: ['title'] }
  autocompleteFields = ['author']
  filterHorizontal = ['tags']
  radioFields = { status: admin.VERTICAL }
  saveAs = true
}
```

## Columns: `display()`

```ts
import { display, ModelAdmin } from '@ghuri/admin'
import { html } from 'hono/html'

class PostAdmin extends ModelAdmin<Post> {
  listDisplay = ['title', 'isRecent', 'colored', 'authorName']

  @display({ description: 'Recent?', boolean: true, ordering: '-createdAt' })
  isRecent(obj: Post) { return obj.createdAt > lastWeek() }

  @display({ description: 'Status' })
  colored(obj: Post) { return <span style={`color: ${obj.color}`}>{obj.status}</span> } // JSX is rendered

  // without decorators
  authorName = display({ description: 'Author', emptyValue: '(nobody)' }, async (obj: Post) => (await obj.author)?.username)
}
```

`display({ description, ordering, boolean, emptyValue })` sets the header, the sort field (clicking the header
orders by it), yes/no icons and the empty text. Methods may be async. Values are escaped; return JSX or
`html\`…\`` (from `hono/html`) for markup — never build HTML from user data with `raw()`.
The same callables work in `readonlyFields`.

## Filters

`listFilter` picks a filter for each field: booleans (All / Yes / No / Unknown), `choices`, relations
(FK, M2M, reverse: one link per related object), dates (Any date / Today / Past 7 days / This month / This
year / No date / Has date) and every distinct value otherwise. Pick a filter explicitly with
`['field', FilterClass]`: `RelatedOnlyFieldListFilter` (only related objects in use), `EmptyFieldListFilter`,
`AllValuesFieldListFilter`, `BooleanFieldListFilter`, `ChoicesFieldListFilter`, `DateFieldListFilter`.

```ts
import { SimpleListFilter } from '@ghuri/admin'

class DecadeFilter extends SimpleListFilter {
  title = 'decade born'
  parameterName = 'decade'
  lookups(c, modelAdmin) {
    return [['80s', 'in the eighties'], ['90s', 'in the nineties']]
  }
  queryset(c, qs) {
    if (this.value() === '80s') return qs.filter({ birthday__gte: '1980-01-01', birthday__lt: '1990-01-01' })
    if (this.value() === '90s') return qs.filter({ birthday__gte: '1990-01-01', birthday__lt: '2000-01-01' })
    return qs
  }
}
```

Return the QuerySet **synchronously** from `queryset()`: QuerySets are thenable, so an `async` method would
resolve it to an array (return `{ qs }` from async code instead).

Query-string lookups on local fields (`?views__gte=100`) work like Django; lookups that span relations are
only allowed for paths listed in `listFilter` / `dateHierarchy` (`lookupAllowed()`), others redirect to `?e=1`.

## Actions

An action receives the ModelAdmin, the request context and the selected QuerySet. Return nothing (the user is
redirected back with any messages) or a `Response` (e.g. a confirmation page or a file download).

```ts
import { action, ModelAdmin } from '@ghuri/admin'

export const makePublished = action(
  { description: 'Mark selected %(verbose_name_plural)s as published', permissions: ['change'] },
  async (modelAdmin, c, queryset) => {
    const n = await queryset.update({ published: true })
    await modelAdmin.messageUser(c, `${n} posts were published.`, 'success')
  },
)

class PostAdmin extends ModelAdmin<Post> {
  actions = [makePublished, 'archive']

  @action({ description: 'Archive', permissions: ['publish'] })
  async archive(c, queryset) { await queryset.update({ archived: true }) }

  async hasPublishPermission(c) { return getUser(c).hasPerm('blog.publish_post') }
}
```

- `permissions: ['add' | 'change' | 'delete' | 'view' | 'x']` — the action is offered when any of
  `hasAddPermission(c)` … / `hasXPermission(c)` is true.
- `delete_selected` ("Delete selected …") is a site-wide action with a confirmation page listing every object
  that will be deleted (cascades) and refusing when objects are protected or the user lacks delete permission
  on them. `admin.site.disableAction('delete_selected')` removes it everywhere (name it in `actions` to
  re-enable it for one admin); `admin.site.addAction(fn, name)` adds a site-wide action.
- "Select all N" (select across pages) is supported.

## Inlines

```ts
import { ModelAdmin, StackedInline, TabularInline } from '@ghuri/admin'

class CommentInline extends TabularInline<Comment> {
  model = Comment
  extra = 1            // empty forms shown
  minNum = 0           // forms that must be filled
  maxNum = 10
  canDelete = true
  showChangeLink = true
  fkName = 'post'      // only when Comment has several FKs to Post
  readonlyFields = ['createdAt']
}

class PostAdmin extends ModelAdmin<Post> {
  inlines = [CommentInline]
}
```

Inlines take the form options above (`fields`, `fieldsets`, `readonlyFields`, `rawIdFields`, …),
`verboseName` / `verboseNamePlural`, `classes`, and the permission hooks (defaults: the inline model's
permissions). Without JavaScript the `extra` rows are shown; with it an "Add another …" link clones rows.
Rows are named like Django's formsets (`comments-0-text`, `comments-TOTAL_FORMS`, …; the prefix is the reverse
accessor name, e.g. `comments` or `commentSet`).

## Forms and widgets

Forms are built from the ORM's `Field.formHint()`, converted with `field.toPython()` and validated with the
model's `fullClean()` (null/blank/choices/validators, `clean()`, FK existence, uniqueness), so model validation
errors show next to the right field ("Post with this Slug already exists."). Non-field errors appear on top.

| Model field | Widget |
|---|---|
| `CharField`, `SlugField`, `UUIDField`, … | `<input type="text">` (`maxlength`) |
| `TextField` | `<textarea>` |
| `EmailField` / `URLField` | `type="email"` / `type="url"` |
| integer / float / decimal / duration | `type="number"` (`step`, `min`, `max`) |
| `BooleanField` | checkbox |
| `DateField` / `TimeField` / `DateTimeField` | `type="date"` / `type="time"` / `type="datetime-local"` (UTC) |
| `JSONField` | `<textarea>` (pretty-printed, validated) |
| fields with `choices` | `<select>` (or radios) |
| `ForeignKey` / `OneToOneField` | `<select>`, raw id, autocomplete or radios |
| `ManyToManyField` | multi-select, filter box, raw ids or autocomplete |
| `FileField` / `ImageField` (`@ghuri/storage`) | file input with "Currently: <link>", "Clear" and "Change" (multipart) |

`@ghuri/storage` is optional: file fields are detected by their form hint, uploads are assigned to the model
(the storage uploads them on `save()`), and "Clear" sets the field to empty (files are kept, like Django).

Add form-wide validation by overriding `cleanForm(c, form)`:

```ts
class EventAdmin extends ModelAdmin<Event> {
  cleanForm(c, form) {
    const { start, end } = form.cleanedData as any
    if (start && end && end < start) form.addError('end', 'The end must be after the start.')
  }
}
```

Lower level: `getFormFields(c, obj, fieldNames?)` returns `FormField`s (override to add virtual fields, as
`UserAdmin` does for its password fields), `formfieldForDbField(c, field)` builds one, and
`getFieldQueryset(c, field)` limits FK / M2M choices.

## Hooks

Override these like Django's methods (`c` is the Hono context; use `getUser(c)` for the user):

| Hook | |
|---|---|
| `getQueryset(c)` | Base queryset of every view (return it synchronously). |
| `getSearchResults(c, qs, term)` | `[qs, mayHaveDuplicates]`. |
| `getListDisplay(c)`, `getListDisplayLinks(c, list)`, `getListFilter(c)`, `getSearchFields(c)`, `getSortableBy(c)`, `getListSelectRelated(c)`, `getOrdering(c)` | Per-request change list options. |
| `getFields(c, obj)`, `getFieldsets(c, obj)`, `getReadonlyFields(c, obj)`, `getPrepopulatedFields(c, obj)`, `getExclude(c, obj)`, `getAutocompleteFields(c)` | Per-request form options. |
| `getInlines(c, obj)`, `getInlineInstances(c, obj)` | Inlines. |
| `getFormFields(c, obj, names?)`, `formfieldForDbField(c, field)`, `getFieldQueryset(c, field)`, `cleanForm(c, form)` | Form construction (Django's `get_form`). |
| `getChangeformInitialData(c)` | Initial values of the add form (default: query string, `?title=Hi`). |
| `getObject(c, id)` | Object of the change/delete/history views. |
| `saveModel(c, obj, form, change)`, `saveRelated(c, form, formsets, change)`, `saveFormset(c, form, formset, change)` | Saving. |
| `deleteModel(c, obj)`, `deleteQueryset(c, qs)` | Deleting. |
| `responseAdd(c, obj, data)`, `responseChange(c, obj, data)`, `responseDelete(c, repr)` | Redirects after saving (`_continue`, `_addanother`, `_saveasnew`). |
| `logAddition / logChange / logDeletion` | `LogEntry` records (JSON change messages like Django's). |
| `messageUser(c, message, level)` | Flash message (`'debug' \| 'info' \| 'success' \| 'warning' \| 'error'` or the exported constants). |
| `lookupAllowed(lookup, value, c)` | Query-string filtering policy. |
| `getActions(c)`, `getAction(spec)`, `responseAction(c, data, qs)` | Actions. |
| `getUrls()` | URL patterns (add custom views). |
| `getDeletedObjects(objs, c)` | Objects listed on delete confirmations. |
| `getViewOnSiteUrl(obj)`, `getEmptyValueDisplay()` | |

## Permissions

| Hook | Default |
|---|---|
| `hasViewPermission(c, obj?)` | `app.view_model` or `app.change_model` |
| `hasAddPermission(c)` | `app.add_model` |
| `hasChangePermission(c, obj?)` | `app.change_model` |
| `hasDeletePermission(c, obj?)` | `app.delete_model` |
| `hasModulePermission(c)` | `user.hasModulePerms(appLabel)` |

Active superusers pass every check. Users with only the view permission get read-only change forms (no Save
buttons; POSTs answer 403). The index and app pages list only models the user may see; views refuse with 403.
`AdminSite.hasPermission(c)` (default: active staff) guards the whole site.

## Custom admin views

```ts
class PostAdmin extends ModelAdmin<Post> {
  getUrls() {
    return [
      path('stats/', this.adminSite.adminView((c) => this.stats(c)), { name: 'blog_post_stats' }),
      ...super.getUrls(),
    ]
  }

  async stats(c: Context) {
    const total = await Post.objects.count()
    return this.adminSite.renderPage(c, 'Post statistics', <p>{total} posts</p>)
  }
}
// → /admin/blog/post/stats/, reverse('admin:blog_post_stats')
```

`adminSite.adminView(view)` requires a staff user (others are sent to the login page), checks CSRF on unsafe
methods and disables caching. `adminSite.renderPage(c, title, content)` renders inside the admin chrome;
`adminSite.render(c, jsx)` renders any page; `adminSite.eachContext(c)` returns the base template context.

## Customizing the site

```ts
import { AdminSite } from '@ghuri/admin'

class MyAdminSite extends AdminSite {
  siteHeader = 'Acme back office'     // <h1> in the header
  siteTitle = 'Acme'                  // <title> suffix
  indexTitle = 'Dashboard'            // index page title
  siteUrl = '/'                       // "View site" (null hides it)
  emptyValueDisplay = '—'
  enableNavSidebar = true
}
export const staffSite = new MyAdminSite({ name: 'staff' })   // URL namespace
staffSite.register(Post, PostAdmin)
// urls: path('staff/', staffSite.urls) → reverse('staff:index')
```

Change the default site in place: `admin.site.siteHeader = 'Acme'`. Override `hasPermission(c)`,
`getUrls()`, `index(c)`, `getAppList(c)` like Django. `@admin.register(Post, { site: staffSite })` registers
on another site.

## Users and groups

When `auth` is installed, `UserAdmin` and `GroupAdmin` are registered on `admin.site` (unless you register
your own, or `AUTH_USER_MODEL` swaps the user model — then register yours, e.g.
`admin.site.register(Account, AccountAdmin)`). Like Django's:

- the add form asks for the username and the password twice (password validators apply), stores a hash, then
  continues to the full form;
- the change form shows the hash summary (algorithm, iterations, masked salt/hash) and links to
  `<id>/password/` (`admin:auth_user_password_change`) to set a new password;
- `groups` / `userPermissions` / group `permissions` use the filter widget.

`admin.site.unregister(User); admin.site.register(User, MyUserAdmin)` replaces it (subclass `UserAdmin`).

## URL names

All in the site's namespace (`admin:` for `admin.site`):

| Name | URL |
|---|---|
| `index` | `/admin/` |
| `login`, `logout` | `login/`, `logout/` (POST) |
| `password_change`, `password_change_done` | `password_change/`, `password_change/done/` |
| `app_list` (`app_label`) | `<app_label>/` |
| `<app>_<model>_changelist` | `<app>/<model>/` |
| `<app>_<model>_add` | `<app>/<model>/add/` |
| `<app>_<model>_change` / `_delete` / `_history` (`object_id`) | `<app>/<model>/<id>/change/` … |
| `auth_user_password_change` | `auth/user/<id>/password/` |
| `autocomplete` | `autocomplete/` |
| `static` (`path`) | `static/admin.css`, `static/admin.js` |

```ts
reverse('admin:blog_post_change', { object_id: quote(post.pk) })
```

Primary keys in URLs are escaped with Django's `quote()` / `unquote()` (exported).

## Assets, JavaScript and htmx

- One stylesheet, served at `<admin>/static/admin.css` with `Cache-Control: public, max-age=31536000,
  immutable` (URLs carry the version): Django-admin look, responsive, dark mode via `prefers-color-scheme`.
- A small script, `<admin>/static/admin.js`: select-all and counter for actions, prepopulated slugs, inline
  "Add another", multi-select filtering, autocomplete picking, nav sidebar toggle/filter.
- htmx (for autocomplete) loads from jsDelivr by default. Self-host or disable it, and add your own assets,
  with `ADMIN_ASSETS`:

```ts
ADMIN_ASSETS: { htmx: '/static/htmx.min.js', css: ['/static/admin-brand.css'], js: [] },  // htmx: false disables it
```

Every core flow — login, lists, filters, search, sorting, pagination, actions, forms, inlines (`extra` rows),
deletes — works without JavaScript.

## Security

- Staff only (`isActive && isStaff`), permission checks on every view and action.
- CSRF checked on every POST (also without `CsrfMiddleware`), tokens rendered in every form.
- `next` redirects after login are validated (same host only).
- All output is escaped by `hono/jsx`; values from your models never become markup unless you return JSX.
- Responses are `Cache-Control: private, no-store`.
- `LogEntry` records every add/change/delete with a Django-compatible JSON change message.

## Testing

```ts
import { createTestClient } from '@ghuri/core/testing'

const client = createTestClient(app, { env })
await client.forceLogin(await User.objects.createSuperuser('admin', 'a@b.c', 'pw'))
const res = await client.post('/admin/blog/post/add/', {
  form: { title: 'Hi', slug: 'hi', 'comments-TOTAL_FORMS': '0', 'comments-INITIAL_FORMS': '0' },
})
expect(res.status).toBe(302)
```

## Differences from Django

- Views are async and receive the Hono context `c` instead of `request` (`getUser(c)` for `request.user`).
- Forms: no separate `ModelForm` classes — override `getFormFields()` / `formfieldForDbField()` /
  `cleanForm()`; `formfieldOverrides` is keyed by the field's `internalType`.
- Dates and times are entered with native `date` / `time` / `datetime-local` inputs, in UTC; display uses
  Django's default formats (`Jan. 5, 2024, 3:04 p.m.`) in `TIME_ZONE`.
- Templates are JSX components, not overridable template files; customize through options, hooks, CSS
  (`ADMIN_ASSETS.css`) and custom views.
- No "+" related-object popups, no `jsi18n`, no `view_on_site` redirect view (links go straight to
  `getAbsoluteUrl()`), no "show facets", no `@` full-text search (treated as `icontains`).
- Autocomplete is a search box + select powered by htmx (no Select2).
- Delete confirmations don't list auto-created M2M through rows.
- Logout is POST-only (as in Django 5).

## License

MIT
