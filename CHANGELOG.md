# Changelog

## 0.1.0-alpha.0

- Initial alpha: a Django-admin clone for Ghuri.
- `AdminSite` (default `admin.site`, custom sites, `register` / `unregister` / `isRegistered`, `@admin.register`
  for TC39 and legacy decorators), Django URL names in the site namespace, site-wide actions.
- `ModelAdmin` with Django's change list options (`listDisplay`, `listDisplayLinks`, `listFilter`,
  `listSelectRelated`, `listPerPage`, `listMaxShowAll`, `listEditable`, `searchFields` with `^ = @` prefixes and
  related lookups, `searchHelpText`, `dateHierarchy`, `ordering`, `sortableBy`, `showFullResultCount`,
  `emptyValueDisplay`, actions), form options (`fields`, `exclude`, `fieldsets` with `collapse`/`wide`,
  `readonlyFields`, `prepopulatedFields`, `rawIdFields`, `autocompleteFields`, `filterHorizontal`/`Vertical`,
  `radioFields`, `formfieldOverrides`, `saveAs`, `saveOnTop`, `viewOnSite`), hooks and permission methods.
- `display()` and `action()` decorators / helpers; `SimpleListFilter` and field list filters.
- `TabularInline` / `StackedInline` with `extra`, `minNum`, `maxNum`, `canDelete`, `fkName`, `showChangeLink`.
- A ModelForm/formset layer driven by `Field.formHint()`, `toPython()` and `fullClean()`, with widgets for
  every field type, file uploads (optional `@ghuri/storage`) and Django's error messages.
- Pages: login, logout, password change, index with recent actions, app index, change list (search, filters,
  date hierarchy, multi-column sorting, pagination, "show all", bulk actions with select-across, "delete
  selected" with confirmation), add/change forms with inlines, delete confirmation listing cascaded and
  protected objects, object history, autocomplete JSON/htmx endpoint.
- `UserAdmin` (password hash summary, change-password form, add form with two passwords) and `GroupAdmin`,
  registered automatically when `auth` is installed.
- `AdminConfig` with the `LogEntry` model (`django_admin_log`) and its migration (adapted to `AUTH_USER_MODEL`).
- One embedded stylesheet (Django look, responsive, light/dark) and a small progressive-enhancement script,
  served with long cache headers; htmx from a CDN by default (`ADMIN_ASSETS` to self-host).
