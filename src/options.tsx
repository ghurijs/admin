// ModelAdmin and inlines (Django's django.contrib.admin.options).
import { ContentType } from '@ghuri/auth'
import { getUser, kwargs, PermissionDenied, path, type UrlEntry, type UrlPatterns } from '@ghuri/core'
import {
  type BaseModel,
  type Field,
  ForeignKey,
  Max,
  Min,
  type ModelClass,
  Q,
  type QNode,
  type QuerySet,
  type RelatedObject,
} from '@ghuri/orm'
import type { Context } from 'hono'
import type { Child } from 'hono/jsx'
import {
  ACTION_CHECKBOX,
  ChangeList,
  type ChangeListOptions,
  ERROR_FLAG,
  IncorrectLookupParameters,
  type ListFilterItem,
} from './changelist'
import { getActionOptions } from './decorators'
import {
  displayForField,
  displayForValue,
  displayOptionsFor,
  helpTextFor,
  type ListDisplayItem,
  labelForField,
  lookupField,
} from './display'
import {
  type Choice,
  type FormDataLike,
  FormField,
  type FormFieldOptions,
  type FormsetSaveResult,
  InlineFormSet,
  ModelForm,
  type ModelFormOptions,
  type WidgetType,
} from './forms'
import { addMessage, type MessageLevel, SUCCESS, WARNING } from './messages'
import { ADDITION, CHANGE, type ChangeMessageEntry, DELETION, LogEntry } from './models'
import type { AdminSite } from './site'
import type { Crumb } from './templates/base'
import {
  type AdminFieldView,
  ChangeFormPage,
  type FieldsetView,
  type InlineFormView,
  type InlineView,
} from './templates/changeform'
import { ChangeListPage, type ResultCell, type ResultHeader, type ResultRow } from './templates/changelist'
import { DeleteConfirmationPage, type DeletedTree, HistoryPage } from './templates/pages'
import { Widget } from './templates/widgets'
import {
  capfirst,
  formatDateTime,
  humanize,
  LOOKUP_SEP,
  monthName,
  objectRepr,
  quote,
  smartSplit,
  unquote,
} from './utils'

export const HORIZONTAL = 'horizontal' as const
export const VERTICAL = 'vertical' as const

export interface FieldsetOptions {
  fields: Array<string | string[]>
  classes?: string[]
  description?: string
}
/** `[name | null, { fields, classes?, description? }]` (Django's fieldsets). */
export type Fieldset = [string | null, FieldsetOptions]
/** What `fieldsets` accepts: `Fieldset`s, or plain arrays (class field literals aren't inferred as tuples). */
export type FieldsetsInput = ReadonlyArray<Fieldset | ReadonlyArray<string | null | FieldsetOptions>>

/** Normalize `fieldsets` to `[name, options]` tuples. */
export function normalizeFieldsets(input: FieldsetsInput): Fieldset[] {
  return input.map((entry) => {
    const [name, opts] = entry as unknown as [string | null | undefined, FieldsetOptions | undefined]
    if (!opts || typeof opts !== 'object' || !Array.isArray(opts.fields)) {
      throw new Error(`Invalid fieldset ${JSON.stringify(entry)}: expected [name | null, { fields: [...] }].`)
    }
    return [name ?? null, opts]
  })
}

/** An admin action: `(modelAdmin, c, queryset) => Response | void`. */
export type ActionFunction = (
  modelAdmin: ModelAdmin<any>,
  c: Context,
  queryset: QuerySet<any>,
) => unknown /* Response | void | Promise<Response | void> */

export interface ResolvedAction {
  name: string
  description: string
  run: (c: Context, queryset: QuerySet<any>) => ReturnType<ActionFunction>
  permissions?: string[]
}

export type FormfieldOverrides = Record<
  string,
  Partial<Omit<FormFieldOptions, 'widget'>> & { widget?: WidgetType | string }
>

/** Options shared by ModelAdmin and inlines (Django's BaseModelAdmin). */
export abstract class BaseModelAdmin<M extends BaseModel = any> {
  model: ModelClass
  readonly adminSite: AdminSite

  fields: Array<string | string[]> | null = null
  exclude: string[] | null = null
  fieldsets: FieldsetsInput | null = null
  readonlyFields: ListDisplayItem[] = []
  prepopulatedFields: Record<string, string[]> = {}
  rawIdFields: string[] = []
  autocompleteFields: string[] = []
  filterHorizontal: string[] = []
  filterVertical: string[] = []
  /** `{ field: HORIZONTAL | VERTICAL }` (`'horizontal' | 'vertical'`). */
  radioFields: Record<string, string> = {}
  /** Per field type overrides, keyed by `internalType` (`{ TextField: { widget: 'text' } }`). */
  formfieldOverrides: FormfieldOverrides = {}
  ordering: string[] | null = null
  sortableBy: string[] | null = null
  viewOnSite: boolean | ((obj: M) => string | null) = true
  showFullResultCount = true
  emptyValueDisplay?: string

  constructor(model: ModelClass, adminSite: AdminSite) {
    this.model = model
    this.adminSite = adminSite
  }

  get opts() {
    return this.model._meta
  }

  // ---- permissions --------------------------------------------------------------------------

  protected permName(action: string): string {
    return `${this.opts.appLabel}.${action}_${this.opts.modelName}`
  }

  async hasAddPermission(c: Context, _obj?: unknown): Promise<boolean> {
    return getUser(c).hasPerm(this.permName('add'))
  }

  async hasChangePermission(c: Context, _obj?: M | null): Promise<boolean> {
    return getUser(c).hasPerm(this.permName('change'))
  }

  async hasDeletePermission(c: Context, _obj?: M | null): Promise<boolean> {
    return getUser(c).hasPerm(this.permName('delete'))
  }

  async hasViewPermission(c: Context, _obj?: M | null): Promise<boolean> {
    const u = getUser(c)
    return (await u.hasPerm(this.permName('view'))) || (await u.hasPerm(this.permName('change')))
  }

  async hasViewOrChangePermission(c: Context, obj?: M | null): Promise<boolean> {
    return (await this.hasViewPermission(c, obj)) || (await this.hasChangePermission(c, obj))
  }

  // ---- hooks -----------------------------------------------------------------------------------

  /** Base queryset (Django's `get_queryset`). */
  getQueryset(c: Context): QuerySet<M> {
    let qs = this.model._defaultManager.getQueryset() as QuerySet<M>
    const ordering = this.getOrdering(c)
    if (ordering.length) qs = qs.orderBy(...ordering)
    return qs
  }

  getOrdering(_c: Context): string[] {
    return this.ordering ?? []
  }

  getReadonlyFields(_c: Context, _obj?: M | null): ListDisplayItem[] | Promise<ListDisplayItem[]> {
    return this.readonlyFields
  }

  getPrepopulatedFields(_c: Context, _obj?: M | null): Record<string, string[]> {
    return this.prepopulatedFields
  }

  getExclude(_c: Context, _obj?: M | null): string[] | null {
    return this.exclude
  }

  getAutocompleteFields(_c: Context): string[] {
    return this.autocompleteFields
  }

  getEmptyValueDisplay(): string {
    return this.emptyValueDisplay ?? this.adminSite.emptyValueDisplay
  }

  getSortableBy(_c: Context): string[] | null {
    return this.sortableBy
  }

  /** Editable model fields in declaration order (forward fields + M2M). */
  protected editableFieldNames(): string[] {
    const meta = this.opts
    return [...meta.fields, ...meta.manyToMany]
      .filter((f) => f.editable && !(f as any).isAutoField && !(f as any).autoCreated)
      .sort((a, b) => a.creationCounter - b.creationCounter)
      .map((f) => f.name)
  }

  /** Field names shown on the form (Django's `get_fields`). */
  async getFields(c: Context, obj?: M | null): Promise<Array<string | string[]>> {
    if (this.fields) return this.fields
    const readonly = (await this.getReadonlyFields(c, obj)).filter((r): r is string => typeof r === 'string')
    const exclude = this.getExclude(c, obj) ?? []
    const names = this.editableFieldNames().filter((n) => !exclude.includes(n) && !readonly.includes(n))
    const extraReadonly = (await this.getReadonlyFields(c, obj)).map((r) =>
      typeof r === 'string' ? r : readonlyKey(r),
    )
    return [...names, ...extraReadonly.filter((n) => !names.includes(n))]
  }

  /** Django's `get_fieldsets`. */
  async getFieldsets(c: Context, obj?: M | null): Promise<Fieldset[]> {
    if (this.fieldsets) return normalizeFieldsets(this.fieldsets)
    return [[null, { fields: await this.getFields(c, obj) }]]
  }

  /** Related queryset for a FK / M2M form field (ordered like the related admin). */
  getFieldQueryset(c: Context, dbField: Field<any, any>): QuerySet<any> {
    const rel: ModelClass = (dbField as any).relatedModel
    let qs = rel._defaultManager.all()
    const relatedAdmin = this.adminSite.getModelAdmin(rel)
    if (relatedAdmin) {
      const ordering = relatedAdmin.getOrdering(c)
      if (ordering.length) qs = qs.orderBy(...ordering)
    }
    const limit = (dbField as any).limitChoicesTo
    if (limit) qs = qs.filter(limit)
    return qs
  }

  /** Build the form field for a model field, or null to leave it off the form (Django's `formfield_for_dbfield`). */
  formfieldForDbField(c: Context, dbField: Field<any, any>): FormField | null {
    if (!dbField.editable) return null
    const hint = dbField.formHint() as Record<string, any>
    const f = dbField as any
    const opts: FormFieldOptions = {
      name: dbField.name,
      label: hint.label ?? capfirst(dbField.verboseName),
      required: !!hint.required,
      helpText: dbField.helpText,
      modelField: dbField,
      initial: dbField.hasDefault() ? dbField.getDefault() : undefined,
      attrs: {},
    }
    let widget: WidgetType = (hint.widget as WidgetType) ?? 'text'
    if (hint.maxLength && ['text', 'email', 'url', 'password'].includes(widget))
      opts.attrs!.maxlength = hint.maxLength
    if (widget === 'number') {
      if (hint.step !== undefined) opts.attrs!.step = hint.step
      if (hint.min !== undefined && hint.min > Number.MIN_SAFE_INTEGER) opts.attrs!.min = hint.min
      if (hint.max !== undefined && hint.max < Number.MAX_SAFE_INTEGER) opts.attrs!.max = hint.max
    }
    if (widget === 'file' && hint.accept) opts.attrs!.accept = hint.accept
    if (f.manyToMany) {
      const qs = this.getFieldQueryset(c, dbField)
      opts.queryset = qs
      if (this.rawIdFields.includes(dbField.name)) widget = 'raw-id-multiple'
      else if (this.getAutocompleteFields(c).includes(dbField.name)) widget = 'autocomplete-multiple'
      else if (this.filterHorizontal.includes(dbField.name)) widget = 'filter-horizontal'
      else if (this.filterVertical.includes(dbField.name)) widget = 'filter-vertical'
      else widget = 'select-multiple'
      if (!widget.startsWith('autocomplete') && !widget.startsWith('raw-id'))
        opts.loadChoices = () => loadChoices(qs)
    } else if (f.isRelation) {
      const qs = this.getFieldQueryset(c, dbField)
      opts.queryset = qs
      if (this.rawIdFields.includes(dbField.name)) widget = 'raw-id'
      else if (this.getAutocompleteFields(c).includes(dbField.name)) widget = 'autocomplete'
      else if (this.radioFields[dbField.name]) {
        widget = 'radio'
        opts.meta = { layout: this.radioFields[dbField.name] }
      } else widget = 'select'
      if (widget === 'select' || widget === 'radio') opts.loadChoices = () => loadChoices(qs)
    } else if (dbField.choices) {
      opts.choices = dbField.choices.map(([v, l]) => ({ value: String(v), label: l }))
      if (this.radioFields[dbField.name]) {
        widget = 'radio'
        opts.meta = { layout: this.radioFields[dbField.name] }
      } else widget = 'select'
    }
    opts.widget = widget
    if (widget === 'raw-id' || widget === 'raw-id-multiple' || widget.startsWith('autocomplete')) {
      opts.meta = { ...opts.meta, ...this.relatedWidgetMeta(c, dbField, widget) }
    }
    const override =
      this.formfieldOverrides[dbField.internalType] ?? this.formfieldOverrides[dbField.constructor.name]
    if (override) Object.assign(opts, override, { attrs: { ...opts.attrs, ...override.attrs } })
    return new FormField(opts)
  }

  private relatedWidgetMeta(
    c: Context,
    dbField: Field<any, any>,
    widget: WidgetType,
  ): Record<string, unknown> {
    const rel: ModelClass = (dbField as any).relatedModel
    const meta: Record<string, unknown> = {}
    const relatedAdmin = this.adminSite.getModelAdmin(rel)
    if (widget.startsWith('raw-id') && relatedAdmin) {
      meta.lookupUrl = this.adminSite.tryReverse(`${rel._meta.appLabel}_${rel._meta.modelName}_changelist`)
    }
    if (widget.startsWith('autocomplete')) {
      const base = this.adminSite.tryReverse('autocomplete') ?? ''
      const p = new URLSearchParams({
        app_label: this.opts.appLabel,
        model_name: this.opts.modelName,
        field_name: dbField.name,
      })
      meta.autocompleteUrl = `${base}?${p}`
    }
    void c
    return meta
  }

  /** Form-wide validation hook (Django's `ModelForm.clean`): use `form.addError()` or throw ValidationError. */
  cleanForm(_c: Context, _form: ModelForm): void | Promise<void> {}

  /**
   * The admin form for `obj` (Django's `get_form`): returns the form fields for `fieldNames`
   * (defaults to the fieldsets' fields that aren't read-only).
   */
  async getFormFields(c: Context, obj: M | null, fieldNames?: string[]): Promise<FormField[]> {
    const readonly = (await this.getReadonlyFields(c, obj)).filter((r): r is string => typeof r === 'string')
    const exclude = this.getExclude(c, obj) ?? []
    const names =
      fieldNames ??
      flattenFieldsets(await this.getFieldsets(c, obj)).filter(
        (n) => !readonly.includes(n) && !exclude.includes(n),
      )
    const out: FormField[] = []
    for (const name of names) {
      const dbField = this.opts.getForwardField(name)
      if (!dbField) continue
      if (!dbField.editable) {
        throw new Error(
          `'${name}' cannot be specified for ${this.opts.objectName} model form as it is a non-editable field. Add it to readonlyFields.`,
        )
      }
      const ff = this.formfieldForDbField(c, dbField)
      if (ff) out.push(ff)
    }
    return out
  }

  /** Build an (unbound or bound) ModelForm. */
  async makeForm(
    c: Context,
    opts: Omit<ModelFormOptions, 'model' | 'clean'> & { clean?: ModelFormOptions['clean'] },
  ): Promise<ModelForm> {
    const form = new ModelForm({
      model: this.model,
      ...opts,
      clean: opts.clean ?? ((f) => this.cleanForm(c, f)),
    })
    await form.init()
    await this.prepareRelatedWidgets(c, form)
    return form
  }

  /** Load the selected options of autocomplete widgets and the labels of raw id widgets. */
  protected async prepareRelatedWidgets(c: Context, form: ModelForm): Promise<void> {
    for (const f of form.fields.values()) {
      if (!f.widget.startsWith('autocomplete') && !f.widget.startsWith('raw-id')) continue
      const mf = f.modelField as any
      if (!mf) continue
      let ids: unknown[]
      const v = form.valueFor(f.name)
      if (Array.isArray(v)) ids = v
      else if (typeof v === 'string' && f.widget === 'raw-id-multiple')
        ids = v.split(',').map((s) => s.trim())
      else ids = [v]
      ids = ids.filter((x) => x !== '' && x !== null && x !== undefined)
      if (!ids.length) {
        if (f.widget.startsWith('autocomplete')) f.choices = []
        continue
      }
      const rel: ModelClass = mf.relatedModel
      let objs: BaseModel[] = []
      try {
        objs = (await rel._defaultManager.filter({ pk__in: ids })) as BaseModel[]
      } catch {
        objs = []
      }
      if (f.widget.startsWith('autocomplete')) {
        f.choices = objs.map((o) => ({ value: String(o.pk), label: objectRepr(o) }))
      } else {
        const relatedAdmin = this.adminSite.getModelAdmin(rel)
        const canChange = relatedAdmin ? await relatedAdmin.hasViewOrChangePermission(c) : false
        f.meta.currentLabels = objs.map((o) => ({
          label: objectRepr(o),
          url: canChange
            ? this.adminSite.tryReverse(`${rel._meta.appLabel}_${rel._meta.modelName}_change`, {
                object_id: quote(o.pk),
              })
            : null,
        }))
      }
    }
  }

  /** Readonly display of a field / callable for `obj`. */
  async readonlyContent(name: ListDisplayItem, obj: M | null): Promise<Child> {
    const empty = this.getEmptyValueDisplay()
    if (!obj) return empty
    try {
      const { field, value } = await lookupField(name, obj, this as any)
      const d = displayOptionsFor(name, this.model, this as any)
      if (field && !(field.isRelation && !field.manyToMany && value !== null && typeof value === 'object')) {
        return displayForField(value, field, d?.emptyValue ?? empty) as Child
      }
      return displayForValue(value, d?.emptyValue ?? empty, d?.boolean) as Child
    } catch {
      return empty
    }
  }

  /** Build the fieldset views of a form. */
  async buildFieldsets(
    c: Context,
    fieldsets: Fieldset[],
    form: ModelForm,
    obj: M | null,
    allReadonly = false,
  ): Promise<FieldsetView[]> {
    const readonly = await this.getReadonlyFields(c, obj)
    const readonlyNames = new Set(readonly.map((r) => (typeof r === 'string' ? r : readonlyKey(r))))
    const readonlyByKey = new Map(readonly.map((r) => [typeof r === 'string' ? r : readonlyKey(r), r]))
    const prepopulated = this.getPrepopulatedFields(c, obj)
    const out: FieldsetView[] = []
    for (const [name, opts] of fieldsets) {
      const lines = []
      for (const entry of opts.fields) {
        const names = Array.isArray(entry) ? entry : [entry]
        const fields: AdminFieldView[] = []
        for (const n of names) {
          const ff = form.fields.get(n)
          if (ff && !readonlyNames.has(n) && !allReadonly) {
            const extraAttrs: Record<string, unknown> = {}
            if (prepopulated[n]) {
              extraAttrs['data-prepopulated-from'] = JSON.stringify(prepopulated[n])
              extraAttrs['data-prepopulated-prefix'] = form.prefix ? `${form.prefix}-` : ''
            }
            fields.push({
              kind: 'field',
              name: n,
              field: ff,
              form,
              label: ff.label,
              required: ff.required,
              helpText: ff.helpText,
              errors: form.errors[n] ?? [],
              extraAttrs,
            })
          } else {
            const item = readonlyByKey.get(n) ?? n
            fields.push({
              kind: 'readonly',
              name: n,
              label: labelForField(item, this.model, this as any),
              content: await this.readonlyContent(item, obj),
              helpText: helpTextFor(item, this.model),
            })
          }
        }
        if (fields.length) lines.push({ fields })
      }
      out.push({ name, classes: opts.classes ?? [], description: opts.description, lines })
    }
    return out
  }
}

/** Key used in fieldsets for a callable readonly field. */
export function readonlyKey(fn: Function | string): string {
  return typeof fn === 'string' ? fn : fn.name || 'callable'
}

export function flattenFieldsets(fieldsets: Fieldset[]): string[] {
  const out: string[] = []
  for (const [, opts] of fieldsets) {
    for (const f of opts.fields) {
      if (Array.isArray(f)) out.push(...f)
      else out.push(f)
    }
  }
  return out
}

async function loadChoices(qs: QuerySet<any>): Promise<Choice[]> {
  const objs = (await qs) as BaseModel[]
  return objs.map((o) => ({ value: String(o.pk), label: objectRepr(o) }))
}

async function readFormData(c: Context): Promise<FormDataLike> {
  try {
    return (await c.req.formData()) as unknown as FormDataLike
  } catch {
    return { get: () => null, getAll: () => [], has: () => false }
  }
}

function formatDescription(description: string, model: ModelClass): string {
  return description
    .replace(/%\(verbose_name_plural\)s/g, model._meta.verboseNamePlural)
    .replace(/%\(verbose_name\)s/g, model._meta.verboseName)
}

/** Django's ModelAdmin. Subclass it and register with `admin.site.register(Model, MyAdmin)` or `@admin.register(Model)`. */
export class ModelAdmin<M extends BaseModel = any> extends BaseModelAdmin<M> {
  listDisplay: ListDisplayItem[] = ['__str__']
  /** `undefined` → first column; `null` → no links. */
  listDisplayLinks: ListDisplayItem[] | null | undefined = undefined
  listFilter: ListFilterItem[] = []
  listSelectRelated: boolean | string[] = false
  listPerPage = 100
  listMaxShowAll = 200
  listEditable: string[] = []
  searchFields: string[] = []
  searchHelpText: string | null = null
  dateHierarchy: string | null = null
  saveAs = false
  saveAsContinue = true
  saveOnTop = false
  preserveFilters = true
  inlines: Array<new (parentModel: ModelClass, site: AdminSite) => InlineModelAdmin<any>> = []
  /** Actions: functions, method names, or site-wide action names (`'delete_selected'`). `null` disables actions. */
  actions: Array<ActionFunction | string> | null = []
  actionsOnTop = true
  actionsOnBottom = false
  actionsSelectionCounter = true

  // ---- URLs ------------------------------------------------------------------------------------

  get urlInfo(): string {
    return `${this.opts.appLabel}_${this.opts.modelName}`
  }

  /** URL patterns of this admin (Django's `get_urls`). Override to add custom views (wrap them in `adminSite.adminView`). */
  getUrls(): UrlEntry[] {
    const info = this.urlInfo
    const wrap = (fn: (c: Context) => Promise<Response>) => this.adminSite.adminView(fn)
    return [
      path(
        '',
        wrap((c) => this.changelistView(c)),
        { name: `${info}_changelist` },
      ),
      path(
        'add/',
        wrap((c) => this.addView(c)),
        { name: `${info}_add` },
      ),
      path(
        '<str:object_id>/history/',
        wrap((c) => this.historyView(c, kwargs(c).object_id)),
        {
          name: `${info}_history`,
        },
      ),
      path(
        '<str:object_id>/delete/',
        wrap((c) => this.deleteView(c, kwargs(c).object_id)),
        {
          name: `${info}_delete`,
        },
      ),
      path(
        '<str:object_id>/change/',
        wrap((c) => this.changeView(c, kwargs(c).object_id)),
        {
          name: `${info}_change`,
        },
      ),
      path(
        '<str:object_id>/',
        wrap(async (c) => {
          const id = kwargs(c).object_id as string
          return c.redirect(this.adminSite.reverse(`${info}_change`, { object_id: id }), 301)
        }),
      ),
    ]
  }

  get urls(): UrlPatterns {
    return this.getUrls() as UrlPatterns
  }

  /** Reverse one of this admin's URLs (`'changelist' | 'add' | 'change' | 'delete' | 'history'`). */
  url(view: string, obj?: { pk: unknown } | null): string {
    const params = obj ? { object_id: quote(obj.pk) } : undefined
    return this.adminSite.reverse(`${this.urlInfo}_${view}`, params)
  }

  // ---- hooks -----------------------------------------------------------------------------------

  async hasModulePermission(c: Context): Promise<boolean> {
    const u = getUser(c)
    if (typeof u.hasModulePerms === 'function') return u.hasModulePerms(this.opts.appLabel)
    return !!u.isSuperuser
  }

  async getModelPerms(
    c: Context,
  ): Promise<{ add: boolean; change: boolean; delete: boolean; view: boolean }> {
    return {
      add: await this.hasAddPermission(c),
      change: await this.hasChangePermission(c),
      delete: await this.hasDeletePermission(c),
      view: await this.hasViewPermission(c),
    }
  }

  getListDisplay(_c: Context): ListDisplayItem[] {
    return this.listDisplay
  }

  getListDisplayLinks(_c: Context, listDisplay: ListDisplayItem[]): ListDisplayItem[] | null {
    if (this.listDisplayLinks !== undefined) return this.listDisplayLinks
    const first = listDisplay.find((d) => d !== ACTION_CHECKBOX)
    return first === undefined ? [] : [first]
  }

  getListFilter(_c: Context): ListFilterItem[] {
    return this.listFilter
  }

  getListSelectRelated(_c: Context): boolean | string[] {
    return this.listSelectRelated
  }

  getSearchFields(_c: Context): string[] {
    return this.searchFields
  }

  /** Django's `get_search_results`: returns `[queryset, mayHaveDuplicates]`. */
  async getSearchResults(
    c: Context,
    queryset: QuerySet<M>,
    searchTerm: string,
  ): Promise<[QuerySet<M>, boolean]> {
    const fields = this.getSearchFields(c)
    if (!fields.length || !searchTerm) return [queryset, false]
    const lookups = fields.map(constructSearch)
    let qs = queryset
    for (const bit of smartSplit(searchTerm)) {
      let q: QNode | null = null
      for (const lookup of lookups) {
        const node = Q({ [lookup]: bit })
        q = q ? q.or(node) : node
      }
      if (q) qs = qs.filter(q)
    }
    return [qs, false]
  }

  /** Can the changelist be filtered by `lookup` from the query string? (Django's `lookup_allowed`.) */
  lookupAllowed(lookup: string, _value: string, c: Context): boolean {
    const parts = lookup.split(LOOKUP_SEP)
    const relationParts: string[] = []
    let current: ModelClass = this.model
    for (const part of parts) {
      const f = current._meta.findField(part) as any
      if (!f) break
      relationParts.push(part)
      if (f.isRelation && f.relatedModel) current = f.relatedModel
      else break
    }
    if (relationParts.length <= 1) return true
    const valid = new Set<string>()
    if (this.dateHierarchy) valid.add(this.dateHierarchy)
    for (const item of this.getListFilter(c)) {
      if (typeof item === 'string') valid.add(item)
      else if (Array.isArray(item)) valid.add(item[0])
    }
    for (let i = relationParts.length; i > 0; i--) {
      if (valid.has(relationParts.slice(0, i).join(LOOKUP_SEP))) return true
    }
    return false
  }

  getInlines(
    _c: Context,
    _obj: M | null,
  ): Array<new (parentModel: ModelClass, site: AdminSite) => InlineModelAdmin<any>> {
    return this.inlines
  }

  /** Inline instances the user may see (Django's `get_inline_instances`). */
  async getInlineInstances(c: Context, obj: M | null): Promise<InlineModelAdmin<any>[]> {
    const out: InlineModelAdmin<any>[] = []
    for (const cls of this.getInlines(c, obj)) {
      const inline = new cls(this.model, this.adminSite)
      const canView = await inline.hasViewOrChangePermission(c, obj)
      const canAdd = await inline.hasAddPermission(c, obj)
      const canDelete = await inline.hasDeletePermission(c, obj)
      if (!(canView || canAdd || canDelete)) continue
      out.push(inline)
    }
    return out
  }

  getChangeformInitialData(c: Context): Record<string, unknown> {
    const url = new URL(c.req.url)
    const initial: Record<string, unknown> = {}
    for (const [k, v] of url.searchParams) {
      if (k === '_changelist_filters') continue
      const f = this.opts.getForwardField(k)
      if (!f) continue
      initial[f.name] = f.manyToMany ? v.split(',') : v
    }
    return initial
  }

  /** Fetch the object for a change/delete/history view, or null (Django's `get_object`). */
  async getObject(c: Context, objectId: string): Promise<M | null> {
    const pkField = this.opts.pk
    let pk: unknown
    try {
      pk = pkField.toPython(objectId)
    } catch {
      return null
    }
    try {
      return (await this.getQueryset(c).filter({ pk }).first()) as M | null
    } catch {
      return null
    }
  }

  getViewOnSiteUrl(obj: M | null): string | null {
    if (!obj || !this.viewOnSite) return null
    if (typeof this.viewOnSite === 'function') return this.viewOnSite(obj)
    const fn = (obj as any).getAbsoluteUrl
    if (typeof fn === 'function') {
      try {
        return fn.call(obj)
      } catch {
        return null
      }
    }
    return null
  }

  // ---- saving / logging --------------------------------------------------------------------------

  /** Save the object (Django's `save_model`). */
  async saveModel(_c: Context, obj: M, _form: ModelForm, _change: boolean): Promise<void> {
    await obj.save()
  }

  /** Delete one object (Django's `delete_model`). */
  async deleteModel(_c: Context, obj: M): Promise<void> {
    await obj.delete()
  }

  /** Delete a queryset (the bulk delete action; Django's `delete_queryset`). */
  async deleteQueryset(_c: Context, queryset: QuerySet<M>): Promise<void> {
    await queryset.delete()
  }

  /** Save one inline formset (Django's `save_formset`). */
  async saveFormset(
    _c: Context,
    _form: ModelForm,
    formset: InlineFormSet,
    _change: boolean,
  ): Promise<FormsetSaveResult> {
    return formset.save()
  }

  /** Save M2M values and inline formsets (Django's `save_related`). */
  async saveRelated(
    c: Context,
    form: ModelForm,
    formsets: InlineFormSet[],
    change: boolean,
  ): Promise<FormsetSaveResult[]> {
    await form.saveM2M()
    const results: FormsetSaveResult[] = []
    for (const fs of formsets) results.push(await this.saveFormset(c, form, fs, change))
    return results
  }

  /** JSON change message (Django's `construct_change_message`). */
  constructChangeMessage(
    _c: Context,
    form: ModelForm,
    formsets: Array<[InlineFormSet, FormsetSaveResult]>,
    add: boolean,
  ): ChangeMessageEntry[] {
    const msg: ChangeMessageEntry[] = []
    if (add) msg.push({ added: {} })
    else {
      const changed = form.changedData().map((n) => form.fields.get(n)?.label ?? n)
      if (changed.length) msg.push({ changed: { fields: changed } })
    }
    for (const [fs, res] of formsets) {
      const name = fs.opts.model._meta.verboseName
      for (const o of res.newObjects) msg.push({ added: { name, object: objectRepr(o) } })
      for (const [o, fields] of res.changedObjects) {
        const labels = fields.map((f) => fs.opts.fields.find((x) => x.name === f)?.label ?? f)
        msg.push({ changed: { name, object: objectRepr(o), fields: labels } })
      }
      for (const o of res.deletedObjects) msg.push({ deleted: { name, object: objectRepr(o) } })
    }
    return msg
  }

  protected async log(
    c: Context,
    obj: BaseModel,
    flag: number,
    message: ChangeMessageEntry[] | string,
  ): Promise<LogEntry | null> {
    const user = getUser(c)
    if (!user.isAuthenticated) return null
    const ct = await ContentType.objects.getForModel(obj.constructor as any)
    return LogEntry.objects.logAction({
      userId: user.pk,
      contentTypeId: ct.pk,
      objectId: obj.pk,
      objectRepr: objectRepr(obj),
      actionFlag: flag,
      changeMessage: message,
    })
  }

  logAddition(c: Context, obj: BaseModel, message: ChangeMessageEntry[] | string): Promise<LogEntry | null> {
    return this.log(c, obj, ADDITION, message)
  }

  logChange(c: Context, obj: BaseModel, message: ChangeMessageEntry[] | string): Promise<LogEntry | null> {
    return this.log(c, obj, CHANGE, message)
  }

  logDeletion(c: Context, obj: BaseModel, objectRepr: string): Promise<LogEntry | null> {
    const user = getUser(c)
    if (!user.isAuthenticated) return Promise.resolve(null)
    return ContentType.objects.getForModel(obj.constructor as any).then((ct: any) =>
      LogEntry.objects.logAction({
        userId: user.pk,
        contentTypeId: ct.pk,
        objectId: obj.pk,
        objectRepr,
        actionFlag: DELETION,
        changeMessage: '',
      }),
    )
  }

  /** Flash a message on the next page (Django's `message_user`). */
  async messageUser(c: Context, message: string, level: MessageLevel = 'info'): Promise<void> {
    await addMessage(c, level, message)
  }

  // ---- actions -----------------------------------------------------------------------------------

  /** Resolve an action spec to `{ name, description, run }` (Django's `get_action`). */
  getAction(action: ActionFunction | string): ResolvedAction | null {
    if (typeof action === 'function') {
      const opts = getActionOptions(action)
      const name = action.name || 'action'
      return {
        name,
        description: opts?.description ?? capfirst(humanize(name)),
        run: (c, qs) => action(this, c, qs),
        permissions: opts?.permissions,
      }
    }
    const method = (this as any)[action]
    if (typeof method === 'function') {
      const opts = getActionOptions(method)
      return {
        name: action,
        description: opts?.description ?? capfirst(humanize(action)),
        run: (c, qs) => method.call(this, c, qs),
        permissions: opts?.permissions,
      }
    }
    const siteAction = this.adminSite.getAction(action)
    if (siteAction) {
      const opts = getActionOptions(siteAction)
      return {
        name: action,
        description: opts?.description ?? capfirst(humanize(action)),
        run: (c, qs) => siteAction(this, c, qs),
        permissions: opts?.permissions,
      }
    }
    return null
  }

  /** Available actions for this request, after permission checks (Django's `get_actions`). */
  async getActions(c: Context): Promise<Map<string, ResolvedAction>> {
    const out = new Map<string, ResolvedAction>()
    if (this.actions === null) return out
    const specs: Array<ActionFunction | string> = [...this.adminSite.enabledActions(), ...this.actions]
    for (const spec of specs) {
      const a = this.getAction(spec)
      if (!a) continue
      if (a.permissions?.length) {
        let ok = false
        for (const p of a.permissions) {
          const check = (this as any)[`has${capfirst(p)}Permission`]
          if (typeof check !== 'function') {
            throw new Error(
              `${this.constructor.name} must define a has${capfirst(p)}Permission() method for the ${a.name} action.`,
            )
          }
          if (await check.call(this, c)) {
            ok = true
            break
          }
        }
        if (!ok) continue
      }
      out.set(a.name, a)
    }
    return out
  }

  async getActionChoices(c: Context): Promise<Array<[string, string]>> {
    const actions = await this.getActions(c)
    return [...actions.values()].map((a) => [a.name, formatDescription(a.description, this.model)])
  }

  /** Run the action posted from the changelist (Django's `response_action`). */
  async responseAction(c: Context, data: FormDataLike, queryset: QuerySet<M>): Promise<Response | null> {
    const index = Number.parseInt(String(data.get('index') ?? '0'), 10) || 0
    const actionNames = data.getAll('action').map(String)
    const actionName = actionNames[index] ?? actionNames[0] ?? ''
    const actions = await this.getActions(c)
    const action = actions.get(actionName)
    if (!action) {
      await this.messageUser(c, 'No action selected.', WARNING)
      return null
    }
    const selected = data.getAll('_selected_action').map(String)
    const selectAcross = String(data.get('select_across') ?? '0') === '1'
    if (!selected.length && !selectAcross) {
      await this.messageUser(
        c,
        'Items must be selected in order to perform actions on them. No items have been changed.',
        WARNING,
      )
      return null
    }
    const qs = selectAcross ? queryset : queryset.filter({ pk__in: selected })
    const res = await action.run(c, qs)
    return res instanceof Response ? res : null
  }

  // ---- responses ------------------------------------------------------------------------------

  /** `_changelist_filters` of the current request (Django's `get_preserved_filters`). */
  getPreservedFilters(c: Context): string {
    if (!this.preserveFilters) return ''
    const url = new URL(c.req.url)
    let changelistUrl: string | null = null
    try {
      changelistUrl = this.url('changelist')
    } catch {}
    if (changelistUrl && url.pathname === changelistUrl) return url.search.slice(1)
    return url.searchParams.get('_changelist_filters') ?? ''
  }

  /** Add preserved changelist filters to a URL. */
  addPreservedFilters(url: string, preserved: string, toChangelist = false): string {
    if (!preserved) return url
    if (toChangelist) return `${url}?${preserved}`
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}${new URLSearchParams({ _changelist_filters: preserved })}`
  }

  protected async postSaveRedirect(c: Context, preserved: string): Promise<Response> {
    if (await this.hasViewOrChangePermission(c)) {
      return c.redirect(this.addPreservedFilters(this.url('changelist'), preserved, true), 302)
    }
    return c.redirect(this.adminSite.reverse('index'), 302)
  }

  /** Response after adding (Django's `response_add`). */
  async responseAdd(c: Context, obj: M, data: FormDataLike): Promise<Response> {
    const preserved = this.getPreservedFilters(c)
    const name = this.opts.verboseName
    const repr = objectRepr(obj)
    if (
      data.has('_continue') ||
      (data.has('_saveasnew') && this.saveAsContinue && (await this.hasChangePermission(c, obj)))
    ) {
      await this.messageUser(
        c,
        `The ${name} “${repr}” was added successfully. You may edit it again below.`,
        SUCCESS,
      )
      return c.redirect(this.addPreservedFilters(this.url('change', obj), preserved), 302)
    }
    if (data.has('_addanother')) {
      await this.messageUser(
        c,
        `The ${name} “${repr}” was added successfully. You may add another ${name} below.`,
        SUCCESS,
      )
      return c.redirect(this.addPreservedFilters(this.url('add'), preserved), 302)
    }
    await this.messageUser(c, `The ${name} “${repr}” was added successfully.`, SUCCESS)
    return this.postSaveRedirect(c, preserved)
  }

  /** Response after changing (Django's `response_change`). */
  async responseChange(c: Context, obj: M, data: FormDataLike): Promise<Response> {
    const preserved = this.getPreservedFilters(c)
    const name = this.opts.verboseName
    const repr = objectRepr(obj)
    if (data.has('_continue')) {
      await this.messageUser(
        c,
        `The ${name} “${repr}” was changed successfully. You may edit it again below.`,
        SUCCESS,
      )
      return c.redirect(this.addPreservedFilters(this.url('change', obj), preserved), 302)
    }
    if (data.has('_saveasnew')) {
      await this.messageUser(
        c,
        `The ${name} “${repr}” was added successfully. You may edit it again below.`,
        SUCCESS,
      )
      return c.redirect(this.addPreservedFilters(this.url('change', obj), preserved), 302)
    }
    if (data.has('_addanother')) {
      await this.messageUser(
        c,
        `The ${name} “${repr}” was changed successfully. You may add another ${name} below.`,
        SUCCESS,
      )
      return c.redirect(this.addPreservedFilters(this.url('add'), preserved), 302)
    }
    await this.messageUser(c, `The ${name} “${repr}” was changed successfully.`, SUCCESS)
    return this.postSaveRedirect(c, preserved)
  }

  /** Response after deleting (Django's `response_delete`). */
  async responseDelete(c: Context, objDisplay: string): Promise<Response> {
    await this.messageUser(
      c,
      `The ${this.opts.verboseName} “${objDisplay}” was deleted successfully.`,
      SUCCESS,
    )
    return this.postSaveRedirect(c, this.getPreservedFilters(c))
  }

  protected async notFoundRedirect(c: Context, objectId: string): Promise<Response> {
    await this.messageUser(
      c,
      `${capfirst(this.opts.verboseName)} with ID “${objectId}” doesn’t exist. Perhaps it was deleted?`,
      WARNING,
    )
    return c.redirect(this.adminSite.reverse('index'), 302)
  }

  // ---- breadcrumbs ------------------------------------------------------------------------------

  protected async breadcrumbs(c: Context, extra: Crumb[]): Promise<Crumb[]> {
    const appLabel = this.opts.appLabel
    const canList = await this.hasViewOrChangePermission(c)
    return [
      { label: 'Home', url: this.adminSite.reverse('index') },
      {
        label: this.adminSite.appVerboseName(appLabel),
        url: this.adminSite.tryReverse('app_list', { app_label: appLabel }),
      },
      { label: capfirst(this.opts.verboseNamePlural), url: canList ? this.url('changelist') : null },
      ...extra,
    ]
  }

  protected bodyClass(view: string): string {
    return `app-${this.opts.appLabel} model-${this.opts.modelName} ${view}`
  }

  // ---- views ---------------------------------------------------------------------------------------

  /** Django's `changelist_view`. */
  async changelistView(c: Context): Promise<Response> {
    if (!(await this.hasViewOrChangePermission(c))) throw new PermissionDenied()
    const actions = await this.getActions(c)
    let listDisplay = [...this.getListDisplay(c)]
    if (actions.size) listDisplay = [ACTION_CHECKBOX, ...listDisplay]
    const sortableBy = this.getSortableBy(c)
    const clOpts: ChangeListOptions = {
      listDisplay,
      listDisplayLinks: this.getListDisplayLinks(c, listDisplay),
      listFilter: this.getListFilter(c),
      dateHierarchy: this.dateHierarchy,
      searchFields: this.getSearchFields(c),
      listSelectRelated: this.getListSelectRelated(c),
      listPerPage: this.listPerPage,
      listMaxShowAll: this.listMaxShowAll,
      listEditable: this.listEditable,
      sortableBy,
      searchHelpText: this.searchHelpText,
    }
    const cl = new ChangeList(c, this, clOpts)
    try {
      await cl.init()
    } catch (err) {
      if (!(err instanceof IncorrectLookupParameters)) throw err
      const url = new URL(c.req.url)
      if (url.searchParams.has(ERROR_FLAG)) {
        return this.adminSite.render(c, this.adminSite.databaseErrorPage(await this.adminSite.eachContext(c)))
      }
      return c.redirect(`${url.pathname}?${ERROR_FLAG}=1`, 302)
    }

    let listEditableForms: ModelForm[] | null = null
    let listEditableErrors = 0
    if (c.req.method === 'POST') {
      const data = await readFormData(c)
      const hasActionPost =
        actions.size && !data.has('_save') && (data.has('index') || data.has('_selected_action'))
      if (hasActionPost) {
        const res = await this.responseAction(c, data, cl.queryset)
        if (res) return res
        return c.redirect(c.req.url.replace(/^https?:\/\/[^/]+/, ''), 302)
      }
      if (this.listEditable.length && data.has('_save')) {
        if (!(await this.hasChangePermission(c))) throw new PermissionDenied()
        const { forms, ok } = await this.listEditableFormset(c, cl, data)
        listEditableForms = forms
        if (ok) {
          let changed = 0
          for (const form of forms) {
            const fields = form.changedData()
            if (!fields.length) continue
            await this.saveModel(c, form.instance as M, form, true)
            await form.saveM2M()
            await this.logChange(c, form.instance, this.constructChangeMessage(c, form, [], false))
            changed++
          }
          if (changed) {
            const name = changed === 1 ? this.opts.verboseName : this.opts.verboseNamePlural
            await this.messageUser(
              c,
              `${changed} ${name} ${changed === 1 ? 'was' : 'were'} changed successfully.`,
              SUCCESS,
            )
          }
          return c.redirect(c.req.url.replace(/^https?:\/\/[^/]+/, ''), 302)
        }
        for (const f of forms) listEditableErrors += Object.keys(f.errors).length
      }
    }
    if (this.listEditable.length && !listEditableForms && (await this.hasChangePermission(c))) {
      listEditableForms = (await this.listEditableFormset(c, cl)).forms
    }

    const ctx = await this.adminSite.eachContext(c)
    const { headers, rows } = await this.buildResults(c, cl, listEditableForms)
    const addUrl = (await this.hasAddPermission(c))
      ? this.addPreservedFilters(this.url('add'), cl.preservedFilters())
      : null
    const canChange = await this.hasChangePermission(c)
    const filters = []
    for (const spec of cl.filterSpecs) filters.push({ title: spec.title, choices: await spec.choices(cl) })
    const title = canChange
      ? `Select ${this.opts.verboseName} to change`
      : `Select ${this.opts.verboseName} to view`
    return this.adminSite.render(
      c,
      <ChangeListPage
        ctx={ctx}
        title={title}
        subtitle={cl.query ? `Search results for “${cl.query}”` : null}
        cl={cl}
        breadcrumbs={[
          { label: 'Home', url: this.adminSite.reverse('index') },
          {
            label: this.adminSite.appVerboseName(this.opts.appLabel),
            url: this.adminSite.tryReverse('app_list', { app_label: this.opts.appLabel }),
          },
          { label: capfirst(this.opts.verboseNamePlural) },
        ]}
        addUrl={addUrl}
        addLabel={`Add ${this.opts.verboseName}`}
        verboseName={this.opts.verboseName}
        verboseNamePlural={this.opts.verboseNamePlural}
        headers={headers}
        rows={rows}
        actionChoices={actions.size ? await this.getActionChoices(c) : null}
        actionsOnTop={this.actionsOnTop}
        actionsOnBottom={this.actionsOnBottom}
        actionsSelectionCounter={this.actionsSelectionCounter}
        hasSearch={clOpts.searchFields.length > 0}
        searchHelpText={this.searchHelpText}
        dateHierarchy={await this.dateHierarchyView(cl)}
        filters={filters}
        listEditable={
          listEditableForms
            ? {
                management: {
                  'form-TOTAL_FORMS': String(listEditableForms.length),
                  'form-INITIAL_FORMS': String(listEditableForms.length),
                  'form-MIN_NUM_FORMS': '0',
                  'form-MAX_NUM_FORMS': '1000',
                },
                errors: listEditableErrors,
              }
            : null
        }
        currentModel={this.model}
        bodyClass={`${this.bodyClass('change-list')}`}
        preservedFilters={cl.preservedFilters()}
      />,
    )
  }

  /** Forms for `listEditable` rows (bound when `data` is given). */
  protected async listEditableFormset(
    c: Context,
    cl: ChangeList,
    data?: FormDataLike,
  ): Promise<{ forms: ModelForm[]; ok: boolean }> {
    const fields = await this.getFormFields(c, null, this.listEditable)
    const forms: ModelForm[] = []
    const pkName = this.opts.pk.name
    let ok = true
    if (data) {
      const total = Math.min(1000, Number.parseInt(String(data.get('form-TOTAL_FORMS') ?? '0'), 10) || 0)
      for (let i = 0; i < total; i++) {
        const pk = data.get(`form-${i}-${pkName}`)
        if (pk === null) continue
        const obj = await this.getObject(c, String(pk))
        if (!obj) continue
        const form = await this.makeForm(c, { instance: obj, fields, data, prefix: `form-${i}` })
        if (!(await form.isValid())) ok = false
        forms.push(form)
      }
      return { forms, ok }
    }
    for (let i = 0; i < cl.resultList.length; i++) {
      forms.push(await this.makeForm(c, { instance: cl.resultList[i], fields, prefix: `form-${i}` }))
    }
    return { forms, ok }
  }

  /** Column headers and rows of the changelist (Django's `result_headers` / `results`). */
  protected async buildResults(
    _c: Context,
    cl: ChangeList,
    editableForms: ModelForm[] | null,
  ): Promise<{ headers: ResultHeader[]; rows: ResultRow[] }> {
    const orderingCols = cl.getOrderingFieldColumns()
    const colKeys = [...orderingCols.keys()]
    const headers: ResultHeader[] = cl.listDisplay.map((name, i) => {
      if (name === ACTION_CHECKBOX) {
        return {
          isCheckbox: true,
          text: '',
          className: 'action-checkbox-column',
          sortable: false,
          sorted: false,
          ascending: true,
          sortPriority: 0,
          urlPrimary: '',
          urlRemove: '',
          urlToggle: '',
        }
      }
      const key = typeof name === 'string' ? name : name.name
      const text = labelForField(name, this.model, this)
      const sortable = cl.isSortable(name)
      const sorted = orderingCols.has(i)
      const orderType = orderingCols.get(i) ?? 'asc'
      const newOrderType = sorted ? (orderType === 'asc' ? 'desc' : 'asc') : 'asc'
      const param = (t: string, n: number) => `${t === 'desc' ? '-' : ''}${n}`
      const primary: string[] = []
      const remove: string[] = []
      const toggle: string[] = []
      for (const [j, ot] of orderingCols) {
        if (j === i) {
          const p = param(newOrderType, j)
          primary.unshift(p)
          toggle.push(p)
        } else {
          const p = param(ot, j)
          primary.push(p)
          remove.push(p)
          toggle.push(p)
        }
      }
      if (!sorted) primary.unshift(param(newOrderType, i))
      return {
        text,
        className: `column-${key}`,
        sortable,
        sorted,
        ascending: orderType === 'asc',
        sortPriority: sorted ? colKeys.indexOf(i) + 1 : 0,
        urlPrimary: cl.getQueryString({ o: primary.join('.') }),
        urlRemove: cl.getQueryString({ o: remove.join('.') || null }),
        urlToggle: cl.getQueryString({ o: toggle.join('.') }),
      }
    })
    const preserved = cl.preservedFilters()
    const empty = this.getEmptyValueDisplay()
    const pkName = this.opts.pk.name
    const rows: ResultRow[] = []
    for (let r = 0; r < cl.resultList.length; r++) {
      const obj = cl.resultList[r] as M
      const form = editableForms?.[r]
      const cells: ResultCell[] = []
      let changeUrl: string | null = null
      try {
        changeUrl = this.addPreservedFilters(this.url('change', obj), preserved)
      } catch {}
      for (const name of cl.listDisplay) {
        if (name === ACTION_CHECKBOX) {
          cells.push({
            isLink: false,
            className: 'action-checkbox',
            content: (
              <input
                type="checkbox"
                name="_selected_action"
                value={String(obj.pk)}
                class="action-select"
                aria-label={`Select this object for an action - ${objectRepr(obj)}`}
              />
            ),
          })
          continue
        }
        const key = typeof name === 'string' ? name : name.name
        let content: unknown
        let isBooleanField = false
        try {
          const { field, value } = await lookupField(name, obj, this)
          const d = displayOptionsFor(name, this.model, this)
          const emptyValue = d?.emptyValue ?? empty
          if (field && !(field.isRelation && !field.manyToMany)) {
            content = displayForField(value, field, emptyValue)
            isBooleanField = field.internalType === 'BooleanField'
          } else {
            content = displayForValue(value, emptyValue, d?.boolean)
          }
        } catch {
          content = empty
        }
        const isLink = cl.listDisplayLinks.includes(name)
        if (form && typeof name === 'string' && this.listEditable.includes(name) && !isLink) {
          const ff = form.fields.get(name)
          if (ff) {
            cells.push({
              isLink: false,
              className: `field-${key}`,
              content: <Widget form={form} field={ff} />,
              errors: form.errors[name],
            })
            continue
          }
        }
        cells.push({
          isLink,
          url: isLink ? (changeUrl ?? undefined) : undefined,
          className: `field-${key}${isBooleanField ? ' boolean' : ''}`,
          content: content as Child,
        })
      }
      rows.push({
        pk: String(obj.pk),
        cells,
        hidden: form ? (
          <td class="hidden">
            <input
              type="hidden"
              name={`form-${r}-${pkName}`}
              value={String(obj.pk)}
              id={`id_form-${r}-${pkName}`}
            />
          </td>
        ) : undefined,
      })
    }
    return { headers, rows }
  }

  /** Date hierarchy links (Django's `date_hierarchy` template tag). */
  protected async dateHierarchyView(cl: ChangeList) {
    const dh = cl.dateHierarchy
    if (!dh) return null
    const field = dh.field
    const link = (filters: Record<string, string | number>) => cl.getQueryString(filters, [`${field}__`])
    const qs = cl.queryset.orderBy()
    if (dh.year !== undefined && dh.month !== undefined && dh.day !== undefined) {
      return {
        back: {
          link: link({ [`${field}__year`]: dh.year, [`${field}__month`]: dh.month }),
          title: `${monthName(dh.month)} ${dh.year}`,
        },
        choices: [{ link: '', title: `${monthName(dh.month)} ${dh.day}` }],
      }
    }
    const values = async (): Promise<Date[]> => {
      const raw = (await qs.valuesList(field, { flat: true }).slice(0, 10000)) as unknown[]
      return raw
        .filter((v) => v !== null && v !== undefined)
        .map((v) =>
          v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T00:00:00Z` : String(v)),
        )
        .filter((d) => !Number.isNaN(d.getTime()))
    }
    if (dh.year !== undefined && dh.month !== undefined) {
      const days = [...new Set((await values()).map((d) => d.getUTCDate()))].sort((a, b) => a - b)
      return {
        back: { link: link({ [`${field}__year`]: dh.year }), title: String(dh.year) },
        choices: days.map((day) => ({
          link: link({
            [`${field}__year`]: dh.year!,
            [`${field}__month`]: dh.month!,
            [`${field}__day`]: day,
          }),
          title: `${monthName(dh.month!)} ${day}`,
        })),
      }
    }
    if (dh.year !== undefined) {
      const months = [...new Set((await values()).map((d) => d.getUTCMonth() + 1))].sort((a, b) => a - b)
      return {
        back: { link: link({}), title: 'All dates' },
        choices: months.map((m) => ({
          link: link({ [`${field}__year`]: dh.year!, [`${field}__month`]: m }),
          title: `${monthName(m)} ${dh.year}`,
        })),
      }
    }
    const years = await distinctYears(qs, field)
    return {
      choices: years.map((y) => ({ link: link({ [`${field}__year`]: y }), title: String(y) })),
    }
  }

  async addView(c: Context): Promise<Response> {
    return this.changeformView(c, null)
  }

  async changeView(c: Context, objectId: string): Promise<Response> {
    return this.changeformView(c, objectId)
  }

  /** Django's `changeform_view`: add and change pages. */
  async changeformView(c: Context, objectIdRaw: string | null): Promise<Response> {
    const isPost = c.req.method === 'POST'
    const data = isPost ? await readFormData(c) : undefined
    let objectId = objectIdRaw === null ? null : unquote(objectIdRaw)
    const saveAsNew = isPost && data!.has('_saveasnew') && this.saveAs
    if (saveAsNew) objectId = null
    const add = objectId === null
    let obj: M | null = null
    let canChange = false
    if (add) {
      if (!(await this.hasAddPermission(c))) throw new PermissionDenied()
      canChange = true
    } else {
      obj = await this.getObject(c, objectId!)
      if (!obj) return this.notFoundRedirect(c, objectId!)
      canChange = await this.hasChangePermission(c, obj)
      if (isPost && !canChange) throw new PermissionDenied()
      if (!canChange && !(await this.hasViewPermission(c, obj))) throw new PermissionDenied()
    }
    const readonlyView = !add && !canChange
    const sourceObj = saveAsNew ? null : obj
    const fieldsets = await this.getFieldsets(c, add ? null : obj)
    const formFields = readonlyView ? [] : await this.getFormFields(c, add ? null : obj)
    const multipart = formFields.some((f) => f.isFile)
    const instance = add ? (new (this.model as any)() as M) : (obj as M)

    let form: ModelForm
    let formsets: Array<{ inline: InlineModelAdmin<any>; formset: InlineFormSet }>
    if (isPost) {
      form = await this.makeForm(c, { instance, fields: formFields, data })
      formsets = await this.getFormsets(c, instance, add ? null : obj, data, saveAsNew)
      const formValid = await form.isValid()
      let allValid = formValid
      for (const { formset } of formsets) if (!(await formset.isValid())) allValid = false
      if (allValid) {
        await this.saveModel(c, form.instance as M, form, !add)
        const results = await this.saveRelated(
          c,
          form,
          formsets.map((f) => f.formset),
          !add,
        )
        const message = this.constructChangeMessage(
          c,
          form,
          formsets.map((f, i) => [f.formset, results[i]]),
          add,
        )
        if (add) {
          await this.logAddition(c, form.instance, message)
          return this.responseAdd(c, form.instance as M, data!)
        }
        await this.logChange(c, form.instance, message)
        return this.responseChange(c, form.instance as M, data!)
      }
    } else {
      form = await this.makeForm(c, {
        instance,
        fields: formFields,
        initial: add ? this.getChangeformInitialData(c) : undefined,
      })
      formsets = await this.getFormsets(c, instance, sourceObj, undefined, false)
    }

    const ctx = await this.adminSite.eachContext(c)
    const fieldsetViews = await this.buildFieldsets(c, fieldsets, form, add ? null : (obj as M), readonlyView)
    const inlineViews: InlineView[] = []
    for (const { inline, formset } of formsets)
      inlineViews.push(await inline.buildInlineView(c, formset, readonlyView))
    let errorCount = Object.keys(form.errors).length
    for (const { formset } of formsets) errorCount += formset.errorCount
    const preserved = this.getPreservedFilters(c)
    const name = this.opts.verboseName
    const title = add ? `Add ${name}` : canChange ? `Change ${name}` : `View ${name}`
    const hasAdd = await this.hasAddPermission(c)
    const hasDelete = !add && (await this.hasDeletePermission(c, obj))
    const canSave = (canChange && !add) || (add && hasAdd)
    const submitRow = {
      showSave: canSave,
      showSaveAsNew: !add && this.saveAs && hasAdd && canChange,
      showSaveAndAddAnother: hasAdd && (!this.saveAs || add) && canSave,
      showSaveAndContinue: canSave && (add || canChange),
      deleteUrl: hasDelete ? this.addPreservedFilters(this.url('delete', obj), preserved) : null,
      closeUrl: readonlyView ? this.addPreservedFilters(this.url('changelist'), preserved, true) : null,
    }
    const url = new URL(c.req.url)
    const crumbs = await this.breadcrumbs(c, [{ label: add ? `Add ${name}` : objectRepr(obj) }])
    const anyMultipart = multipart || formsets.some((f) => f.formset.opts.fields.some((x) => x.isFile))
    return this.adminSite.render(
      c,
      <ChangeFormPage
        ctx={ctx}
        title={title}
        subtitle={add ? null : objectRepr(obj)}
        breadcrumbs={crumbs}
        bodyClass={this.bodyClass('change-form')}
        currentModel={this.model}
        add={add}
        formAction={`${url.pathname}${url.search}`}
        multipart={anyMultipart}
        errorCount={errorCount}
        nonFieldErrors={form.nonFieldErrors()}
        fieldsets={fieldsetViews}
        inlines={inlineViews}
        hiddenFields={null}
        submitRow={submitRow}
        saveOnTop={this.saveOnTop}
        historyUrl={add ? null : this.addPreservedFilters(this.url('history', obj), preserved)}
        viewOnSiteUrl={add ? null : this.getViewOnSiteUrl(obj)}
        readonlyView={readonlyView}
      />,
    )
  }

  /** Inline formsets for the change form (Django's `_create_formsets`). */
  async getFormsets(
    c: Context,
    instance: M,
    obj: M | null,
    data: FormDataLike | undefined,
    saveAsNew: boolean,
  ): Promise<Array<{ inline: InlineModelAdmin<any>; formset: InlineFormSet }>> {
    const out: Array<{ inline: InlineModelAdmin<any>; formset: InlineFormSet }> = []
    const prefixes = new Map<string, number>()
    for (const inline of await this.getInlineInstances(c, obj)) {
      let prefix = inline.defaultPrefix()
      const n = (prefixes.get(prefix) ?? 0) + 1
      prefixes.set(prefix, n)
      if (n > 1) prefix = `${prefix}-${n}`
      const formset = await inline.getFormset(c, instance, obj, prefix, data, saveAsNew)
      out.push({ inline, formset })
    }
    return out
  }

  /** Django's `get_deleted_objects`: nested objects, per-model counts, missing perms, protected objects. */
  async getDeletedObjects(
    objs: M[],
    c: Context,
  ): Promise<{
    deleted: DeletedTree
    modelCount: Array<[string, number]>
    permsNeeded: string[]
    protected: Child[]
  }> {
    return collectDeletedObjects(objs, c, this.adminSite)
  }

  /** Django's `delete_view`. */
  async deleteView(c: Context, objectIdRaw: string): Promise<Response> {
    const objectId = unquote(objectIdRaw)
    const obj = await this.getObject(c, objectId)
    if (!obj) return this.notFoundRedirect(c, objectId)
    if (!(await this.hasDeletePermission(c, obj))) throw new PermissionDenied()
    const { deleted, modelCount, permsNeeded, protected: prot } = await this.getDeletedObjects([obj], c)
    if (c.req.method === 'POST' && !prot.length) {
      if (permsNeeded.length) throw new PermissionDenied()
      const display = objectRepr(obj)
      await this.logDeletion(c, obj, display)
      await this.deleteModel(c, obj)
      return this.responseDelete(c, display)
    }
    const ctx = await this.adminSite.eachContext(c)
    const preserved = this.getPreservedFilters(c)
    const title =
      permsNeeded.length || prot.length ? `Cannot delete ${this.opts.verboseName}` : 'Are you sure?'
    const url = new URL(c.req.url)
    return this.adminSite.render(
      c,
      <DeleteConfirmationPage
        ctx={ctx}
        title={title}
        breadcrumbs={
          await this.breadcrumbs(c, [
            { label: objectRepr(obj), url: this.addPreservedFilters(this.url('change', obj), preserved) },
            { label: 'Delete' },
          ])
        }
        bodyClass={`${this.bodyClass('delete-confirmation')}`}
        objectName={this.opts.verboseName}
        objectRepr={objectRepr(obj)}
        deletedObjects={deleted}
        modelCount={modelCount}
        permsLacking={permsNeeded}
        protectedObjects={prot}
        hidden={[]}
        action={`${url.pathname}${url.search}`}
        cancelUrl={this.addPreservedFilters(this.url('change', obj), preserved)}
        currentModel={this.model}
      />,
    )
  }

  /** Django's `history_view`. */
  async historyView(c: Context, objectIdRaw: string): Promise<Response> {
    const objectId = unquote(objectIdRaw)
    const obj = await this.getObject(c, objectId)
    if (!obj) return this.notFoundRedirect(c, objectId)
    if (!(await this.hasViewOrChangePermission(c, obj))) throw new PermissionDenied()
    const ct = await ContentType.objects.getForModel(this.model as any)
    const entries = (await LogEntry.objects
      .filter({ objectId: String(obj.pk), contentType: ct.pk })
      .selectRelated('user')
      .orderBy('actionTime', 'id')
      .slice(0, 1000)) as LogEntry[]
    const rows = []
    for (const e of entries) {
      let user = ''
      try {
        const u = (await (e as any).user) as any
        user = u ? (typeof u.getUsername === 'function' ? u.getUsername() : String(u)) : ''
        const full = typeof u?.getFullName === 'function' ? u.getFullName() : ''
        if (full) user = `${user} (${full})`
      } catch {}
      rows.push({
        time: formatDateTime(e.actionTime),
        isoTime: e.actionTime.toISOString(),
        user,
        message:
          e.getChangeMessage() || (e.isAddition() ? 'Added.' : e.isDeletion() ? 'Deleted.' : 'Changed.'),
      })
    }
    const ctx = await this.adminSite.eachContext(c)
    const preserved = this.getPreservedFilters(c)
    return this.adminSite.render(
      c,
      <HistoryPage
        ctx={ctx}
        title={`Change history: ${objectRepr(obj)}`}
        subtitle=""
        breadcrumbs={
          await this.breadcrumbs(c, [
            { label: objectRepr(obj), url: this.addPreservedFilters(this.url('change', obj), preserved) },
            { label: 'History' },
          ])
        }
        bodyClass={this.bodyClass('object-history')}
        entries={rows}
        currentModel={this.model}
      />,
    )
  }
}

/** `^name` → istartswith, `=name` → iexact, `@name` → icontains (no full-text search), else icontains. */
export function constructSearch(fieldName: string): string {
  if (fieldName.startsWith('^')) return `${fieldName.slice(1)}__istartswith`
  if (fieldName.startsWith('=')) return `${fieldName.slice(1)}__iexact`
  if (fieldName.startsWith('@')) return `${fieldName.slice(1)}__icontains`
  const last = fieldName.split(LOOKUP_SEP).pop()!
  if (SEARCH_LOOKUPS.has(last) && fieldName.includes(LOOKUP_SEP)) return fieldName
  return `${fieldName}__icontains`
}
const SEARCH_LOOKUPS = new Set([
  'exact',
  'iexact',
  'contains',
  'icontains',
  'startswith',
  'istartswith',
  'endswith',
  'iendswith',
  'regex',
  'iregex',
])

async function distinctYears(qs: QuerySet<any>, field: string): Promise<number[]> {
  const agg = (await qs.aggregate({ first: Min(field), last: Max(field) })) as {
    first: unknown
    last: unknown
  }
  const toYear = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    if (v instanceof Date) return v.getUTCFullYear()
    const m = /^(\d{4})/.exec(String(v))
    return m ? Number(m[1]) : null
  }
  const first = toYear(agg.first)
  const last = toYear(agg.last)
  if (first === null || last === null) return []
  const years: number[] = []
  if (last - first > 60) {
    for (let y = first; y <= last; y++) years.push(y)
    return years
  }
  const checks = []
  for (let y = first; y <= last; y++) {
    checks.push(
      qs
        .filter({ [`${field}__gte`]: `${y}-01-01`, [`${field}__lt`]: `${y + 1}-01-01` })
        .exists()
        .then((ok) => (ok ? y : null)),
    )
  }
  for (const y of await Promise.all(checks)) if (y !== null) years.push(y)
  return years
}

// ---------------------------------------------------------------------------------------------
// Deleted-objects collector (Django's NestedObjects + get_deleted_objects)
// ---------------------------------------------------------------------------------------------

export async function collectDeletedObjects(
  objs: BaseModel[],
  c: Context,
  site: AdminSite,
): Promise<{
  deleted: DeletedTree
  modelCount: Array<[string, number]>
  permsNeeded: string[]
  protected: Child[]
}> {
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  const permsNeeded = new Set<string>()
  const protectedObjs: Child[] = []
  let budget = 2000

  const format = async (obj: BaseModel): Promise<Child> => {
    const model = obj.constructor as ModelClass
    const meta = model._meta
    const ma = site.getModelAdmin(model)
    const label = `${capfirst(meta.verboseName)}: `
    if (ma) {
      if (!(await ma.hasDeletePermission(c, obj))) permsNeeded.add(meta.verboseName)
      const url = site.tryReverse(`${meta.appLabel}_${meta.modelName}_change`, { object_id: quote(obj.pk) })
      if (url) {
        return (
          <>
            {label}
            <a href={url}>{objectRepr(obj)}</a>
          </>
        )
      }
    }
    return `${label}${objectRepr(obj)}`
  }

  const visit = async (obj: BaseModel): Promise<DeletedTree[number] | null> => {
    const model = obj.constructor as ModelClass
    const key = `${model._meta.label}:${String(obj.pk)}`
    if (seen.has(key)) return null
    seen.add(key)
    budget--
    const plural = capfirst(model._meta.verboseNamePlural)
    counts.set(plural, (counts.get(plural) ?? 0) + 1)
    const node = { label: await format(obj), children: [] as DeletedTree }
    for (const rel of model._meta.allRelatedObjects as RelatedObject[]) {
      if (rel.manyToMany) continue
      const fk = rel.field as ForeignKey
      if (!(fk instanceof ForeignKey)) continue
      const onDelete = fk.onDelete as unknown
      if (onDelete === 'DO_NOTHING' || onDelete === 'SET_NULL' || onDelete === 'SET_DEFAULT') continue
      if (typeof onDelete === 'object') continue
      const relModel = rel.relatedModel
      const value = (obj as any)[fk.targetField.attname]
      if (value === null || value === undefined) continue
      const related = (await relModel._baseManager.filter({ [fk.name]: value }).slice(0, 500)) as BaseModel[]
      if (!related.length) continue
      if (onDelete === 'PROTECT' || onDelete === 'RESTRICT') {
        for (const r of related) protectedObjs.push(await format(r))
        continue
      }
      for (const r of related) {
        if (relModel._meta.autoCreated) continue
        if (budget <= 0) break
        const child = await visit(r)
        if (child) node.children.push(child)
      }
    }
    return node
  }

  const deleted: DeletedTree = []
  for (const o of objs) {
    const n = await visit(o)
    if (n) deleted.push(n)
  }
  return {
    deleted,
    modelCount: [...counts.entries()],
    permsNeeded: [...permsNeeded],
    protected: protectedObjs,
  }
}

// ---------------------------------------------------------------------------------------------
// Inlines
// ---------------------------------------------------------------------------------------------

/** Find the FK on `model` pointing at `parent` (Django's `_get_foreign_key`). */
export function getForeignKey(parent: ModelClass, model: ModelClass, fkName?: string | null): ForeignKey {
  const fks = model._meta.fields.filter((f): f is ForeignKey => f instanceof ForeignKey)
  if (fkName) {
    const fk = fks.find((f) => f.name === fkName)
    if (!fk) throw new Error(`fkName '${fkName}' is not a ForeignKey to '${parent._meta.label}'.`)
    return fk
  }
  const matching = fks.filter((f) => {
    try {
      return f.relatedModel === parent
    } catch {
      return false
    }
  })
  if (matching.length === 1) return matching[0]
  if (!matching.length)
    throw new Error(`'${model._meta.label}' has no ForeignKey to '${parent._meta.label}'.`)
  throw new Error(
    `'${model._meta.label}' has more than one ForeignKey to '${parent._meta.label}'. You must specify a 'fkName' attribute.`,
  )
}

/** Django's InlineModelAdmin. Use `TabularInline` or `StackedInline`. */
export class InlineModelAdmin<M extends BaseModel = any> extends BaseModelAdmin<M> {
  readonly parentModel: ModelClass
  fkName: string | null = null
  extra = 3
  minNum: number | null = null
  maxNum: number | null = null
  canDelete = true
  showChangeLink = false
  verboseName: string | null = null
  verboseNamePlural: string | null = null
  classes: string[] = []
  description?: string
  template: 'tabular' | 'stacked' = 'tabular'

  constructor(parentModel: ModelClass, adminSite: AdminSite) {
    super(undefined as unknown as ModelClass, adminSite)
    this.parentModel = parentModel
  }

  get displayVerboseName(): string {
    return this.verboseName ?? this.model._meta.verboseName
  }

  get displayVerboseNamePlural(): string {
    return (
      this.verboseNamePlural ??
      (this.verboseName ? `${this.verboseName}s` : this.model._meta.verboseNamePlural)
    )
  }

  get fk(): ForeignKey {
    return getForeignKey(this.parentModel, this.model, this.fkName)
  }

  /** Default formset prefix: the reverse accessor name (`commentSet`, or the FK's `relatedName`). */
  defaultPrefix(): string {
    const fk = this.fk
    const rel = this.parentModel._meta.allRelatedObjects.find(
      (r) => r.field === fk || (r.field.name === fk.name && r.relatedModel === this.model),
    )
    return rel?.getAccessorName() ?? `${this.model._meta.modelName}Set`
  }

  getExtra(_c: Context, _obj: unknown): number {
    return this.extra
  }

  getMinNum(_c: Context, _obj: unknown): number | null {
    return this.minNum
  }

  getMaxNum(_c: Context, _obj: unknown): number | null {
    return this.maxNum
  }

  private get autoCreated(): boolean {
    return !!(this.model._meta as any).autoCreated
  }

  private async parentPerm(c: Context, action: string): Promise<boolean> {
    const meta = this.parentModel._meta
    return getUser(c).hasPerm(`${meta.appLabel}.${action}_${meta.modelName}`)
  }

  override async hasAddPermission(c: Context, obj?: unknown): Promise<boolean> {
    if (this.autoCreated) return this.parentPerm(c, 'change')
    return super.hasAddPermission(c, obj)
  }
  override async hasChangePermission(c: Context, obj?: M | null): Promise<boolean> {
    if (this.autoCreated) return this.parentPerm(c, 'change')
    return super.hasChangePermission(c, obj)
  }
  override async hasDeletePermission(c: Context, obj?: M | null): Promise<boolean> {
    if (this.autoCreated) return this.parentPerm(c, 'change')
    return super.hasDeletePermission(c, obj)
  }
  override async hasViewPermission(c: Context, obj?: M | null): Promise<boolean> {
    if (this.autoCreated) return (await this.parentPerm(c, 'view')) || (await this.parentPerm(c, 'change'))
    return super.hasViewPermission(c, obj)
  }

  /** Field names of each inline form (fieldsets minus the FK to the parent). */
  async inlineFieldNames(c: Context, obj: M | null): Promise<string[]> {
    const fkName = this.fk.name
    return flattenFieldsets(await this.getFieldsets(c, obj)).filter((n) => n !== fkName)
  }

  override async getFields(c: Context, obj?: M | null): Promise<Array<string | string[]>> {
    const fields = await super.getFields(c, obj)
    const fkName = this.fk.name
    return fields.filter((f) => f !== fkName)
  }

  /** Build the formset (Django's `get_formset`). */
  async getFormset(
    c: Context,
    instance: BaseModel,
    parentObj: BaseModel | null,
    prefix: string,
    data: FormDataLike | undefined,
    saveAsNew: boolean,
  ): Promise<InlineFormSet> {
    const fkName = this.fk.name
    const readonly = (await this.getReadonlyFields(c, null)).filter((r): r is string => typeof r === 'string')
    const names = (await this.inlineFieldNames(c, null)).filter((n) => !readonly.includes(n))
    const fields = await this.getFormFields(c, null, names)
    const canChange = await this.hasChangePermission(c, parentObj as any)
    const canAdd = await this.hasAddPermission(c, parentObj)
    const canDelete = this.canDelete && (await this.hasDeletePermission(c, parentObj as any))
    const formset = new InlineFormSet({
      model: this.model,
      parent: instance,
      fkName,
      prefix,
      fields,
      queryset: this.getQueryset(c),
      data,
      extra: this.getExtra(c, parentObj),
      minNum: this.getMinNum(c, parentObj) ?? 0,
      maxNum: canAdd ? (this.getMaxNum(c, parentObj) ?? 1000) : 0,
      canDelete,
      readonly: !canChange,
      saveAsNew,
      canAdd,
    })
    await formset.init()
    for (const f of [...formset.forms, formset.emptyForm]) await this.prepareRelatedWidgets(c, f)
    return formset
  }

  /** View model of the formset for the change form template. */
  async buildInlineView(c: Context, formset: InlineFormSet, allReadonly: boolean): Promise<InlineView> {
    const fkName = this.fk.name
    const fieldsets = (await this.getFieldsets(c, null)).map(
      ([name, opts]) =>
        [
          name,
          {
            ...opts,
            fields: opts.fields
              .map((f) => (Array.isArray(f) ? f.filter((x) => x !== fkName) : f))
              .filter((f) => f !== fkName),
          },
        ] as Fieldset,
    )
    const names = flattenFieldsets(fieldsets)
    const readonly = await this.getReadonlyFields(c, null)
    const readonlyNames = new Set(readonly.map((r) => (typeof r === 'string' ? r : readonlyKey(r))))
    const pkName = this.model._meta.pk.name
    const sample = formset.emptyForm
    const columns = names.map((n) => {
      const ff = sample.fields.get(n)
      if (ff && !readonlyNames.has(n) && !allReadonly) {
        return { label: ff.label, required: ff.required, helpText: ff.helpText, hidden: ff.isHidden }
      }
      return {
        label: labelForField(n, this.model, this as any),
        required: false,
        helpText: helpTextFor(n, this.model),
      }
    })
    const isReadonlyForm = (form: ModelForm) =>
      allReadonly || (formset.opts.readonly && !form.instance._state.adding)
    const view = async (form: ModelForm, index: string, isEmpty: boolean): Promise<InlineFormView> => {
      const original = !form.instance._state.adding ? (form.instance as M) : null
      const ro = isReadonlyForm(form)
      const fsViews = await this.buildFieldsets(c, fieldsets, form, original, ro)
      const cells = fsViews.flatMap((fs) => fs.lines.flatMap((l) => l.fields))
      let changeUrl: string | null = null
      if (original && this.showChangeLink && this.adminSite.isRegistered(this.model)) {
        changeUrl = this.adminSite.tryReverse(`${this.opts.appLabel}_${this.opts.modelName}_change`, {
          object_id: quote(original.pk),
        })
      }
      return {
        form,
        index,
        originalLabel: original ? objectRepr(original) : null,
        changeUrl,
        fieldsets: fsViews,
        cells,
        pkName,
        pkValue: original ? String(original.pk) : null,
        canDelete: formset.opts.canDelete && !allReadonly,
        deleteChecked: formset.shouldDelete(form),
        isEmptyForm: isEmpty,
      }
    }
    const forms: InlineFormView[] = []
    for (let i = 0; i < formset.forms.length; i++) forms.push(await view(formset.forms[i], String(i), false))
    return {
      prefix: formset.prefix,
      kind: this.template,
      verboseName: this.displayVerboseName,
      verboseNamePlural: capfirst(this.displayVerboseNamePlural),
      columns,
      forms,
      emptyForm: allReadonly ? null : await view(formset.emptyForm, '__prefix__', true),
      management: formset.managementValues(),
      nonFormErrors: formset.nonFormErrors,
      canDelete: formset.opts.canDelete && !allReadonly,
      canAdd: !!formset.opts.canAdd && !allReadonly,
      classes: this.classes,
      description: this.description,
    }
  }
}

/** Inline rendered as a table (one row per object). */
export class TabularInline<M extends BaseModel = any> extends InlineModelAdmin<M> {
  override template: 'tabular' | 'stacked' = 'tabular'
}

/** Inline rendered as stacked fieldsets (one block per object). */
export class StackedInline<M extends BaseModel = any> extends InlineModelAdmin<M> {
  override template: 'tabular' | 'stacked' = 'stacked'
}
