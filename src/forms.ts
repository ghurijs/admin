// A small ModelForm / inline formset layer for the admin, driven by the ORM's Field API
// (`formHint()`, `toPython()`, `validate()`) and `instance.fullClean()`.
import { ValidationError } from '@ghuri/core'
import type { BaseModel, Field, ModelClass, QuerySet } from '@ghuri/orm'
import { isFieldFileLike, toDatetimeLocal } from './utils'

export type RawValue = string | File

/** What forms read submitted data from (a `FormData`, or a parsed body). */
export interface FormDataLike {
  get(name: string): RawValue | null
  getAll(name: string): RawValue[]
  has(name: string): boolean
}

/** Wrap Hono's `parseBody({ all: true })` result (or a plain object) as FormDataLike. */
export function toFormData(body: Record<string, unknown> | FormData): FormDataLike {
  if (typeof (body as FormData).getAll === 'function') return body as FormData as unknown as FormDataLike
  const obj = body as Record<string, unknown>
  const list = (name: string): RawValue[] => {
    const v = obj[name]
    if (v === undefined || v === null) return []
    return (Array.isArray(v) ? v : [v]).map((x) => (x instanceof File ? x : String(x)))
  }
  return {
    get: (name) => list(name)[0] ?? null,
    getAll: list,
    has: (name) => name in obj,
  }
}

export const EMPTY_DATA: FormDataLike = { get: () => null, getAll: () => [], has: () => false }

export type WidgetType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'radio'
  | 'select-multiple'
  | 'checkbox-multiple'
  | 'filter-horizontal'
  | 'filter-vertical'
  | 'date'
  | 'datetime'
  | 'time'
  | 'email'
  | 'url'
  | 'json'
  | 'file'
  | 'hidden'
  | 'password'
  | 'raw-id'
  | 'raw-id-multiple'
  | 'autocomplete'
  | 'autocomplete-multiple'

export interface Choice {
  value: string
  label: string
}

export const REQUIRED_MESSAGE = 'This field is required.'

const MULTIPLE_WIDGETS = new Set<WidgetType>([
  'select-multiple',
  'checkbox-multiple',
  'filter-horizontal',
  'filter-vertical',
  'raw-id-multiple',
  'autocomplete-multiple',
])

export interface FormFieldOptions {
  name: string
  label?: string
  required?: boolean
  helpText?: string
  widget?: WidgetType
  attrs?: Record<string, string | number | boolean | undefined>
  choices?: Choice[]
  loadChoices?: () => Promise<Choice[]>
  modelField?: Field<any, any>
  initial?: unknown
  disabled?: boolean
  /** Related queryset for FK / M2M fields (validates submitted ids). */
  queryset?: QuerySet<any>
  /** Extra widget data (e.g. autocomplete / raw id lookup URLs, radio layout). */
  meta?: Record<string, unknown>
  /** Strip whitespace from text input (default true). */
  strip?: boolean
  /** Value for empty input (default: null, or '' for text fields that aren't nullable). */
  emptyValue?: unknown
  /** Extra validators run on the cleaned value. */
  validators?: Array<(value: unknown, form: ModelForm) => void | Promise<void>>
  /** Not saved to the model instance (e.g. password confirmation fields). */
  virtual?: boolean
  emptyLabel?: string
}

/** One input of an admin form (Django's forms.Field + widget). */
export class FormField {
  name: string
  label: string
  required: boolean
  helpText?: string
  widget: WidgetType
  attrs: Record<string, string | number | boolean | undefined>
  choices?: Choice[]
  loadChoices?: () => Promise<Choice[]>
  modelField?: Field<any, any>
  initial?: unknown
  disabled: boolean
  queryset?: QuerySet<any>
  meta: Record<string, unknown>
  strip: boolean
  emptyValue: unknown
  validators: Array<(value: unknown, form: ModelForm) => void | Promise<void>>
  virtual: boolean
  emptyLabel: string

  constructor(opts: FormFieldOptions) {
    this.name = opts.name
    this.label = opts.label ?? opts.name
    this.required = opts.required ?? false
    this.helpText = opts.helpText
    this.widget = opts.widget ?? 'text'
    this.attrs = { ...opts.attrs }
    this.choices = opts.choices
    this.loadChoices = opts.loadChoices
    this.modelField = opts.modelField
    this.initial = opts.initial
    this.disabled = opts.disabled ?? false
    this.queryset = opts.queryset
    this.meta = { ...opts.meta }
    this.strip = opts.strip ?? true
    this.emptyValue = opts.emptyValue
    this.validators = [...(opts.validators ?? [])]
    this.virtual = opts.virtual ?? false
    this.emptyLabel = opts.emptyLabel ?? '---------'
  }

  get multiple(): boolean {
    return MULTIPLE_WIDGETS.has(this.widget)
  }

  get isHidden(): boolean {
    return this.widget === 'hidden'
  }

  get isCheckbox(): boolean {
    return this.widget === 'checkbox'
  }

  get isFile(): boolean {
    return this.widget === 'file'
  }

  get isRelation(): boolean {
    return !!this.modelField?.isRelation
  }

  /** Load `choices` (FK / M2M querysets). */
  async prepare(): Promise<void> {
    if (!this.choices && this.loadChoices) this.choices = await this.loadChoices()
  }

  /** Raw submitted value(s) → cleaned python value. Throws ValidationError. */
  async clean(raw: RawValue[], form: ModelForm, name: string): Promise<unknown> {
    if (this.disabled) return form.initialFor(this.name)
    let value: unknown
    switch (this.widget) {
      case 'checkbox': {
        const v = raw[0]
        value = v !== undefined && !['false', 'False', '0', ''].includes(String(v))
        break
      }
      case 'raw-id-multiple':
        value = String(raw[0] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        break
      case 'file':
        return this.cleanFile(raw, form, name)
      default:
        if (this.multiple) {
          value = raw.filter((v): v is string => typeof v === 'string' && v !== '')
        } else {
          const v = raw[0]
          value = typeof v === 'string' ? (this.strip ? v.trim() : v) : ''
        }
    }
    if (isEmpty(value) && this.widget !== 'checkbox') {
      if (this.required) throw new ValidationError(REQUIRED_MESSAGE, { code: 'required' })
      if (this.multiple) return []
      return this.emptyValueFor()
    }
    let cleaned = await this.toPython(value)
    if (this.widget === 'checkbox' && this.required && cleaned !== true) {
      throw new ValidationError(REQUIRED_MESSAGE, { code: 'required' })
    }
    for (const v of this.validators) await v(cleaned, form)
    if (cleaned === undefined) cleaned = this.emptyValueFor()
    return cleaned
  }

  private emptyValueFor(): unknown {
    if (this.emptyValue !== undefined) return this.emptyValue
    const f = this.modelField
    if (f && !f.isRelation && f.emptyStringsAllowed && !f.null) return ''
    if (!f && this.widget !== 'select') return ''
    return null
  }

  private async cleanFile(raw: RawValue[], form: ModelForm, name: string): Promise<unknown> {
    const upload = raw.find((v): v is File => typeof v !== 'string' && v.name !== '' && v.size >= 0)
    const realUpload = upload && (upload.size > 0 || upload.name) ? upload : undefined
    const clear = form.data.has(`${name}-clear`)
    const initial = form.initialFor(this.name)
    const hasInitial = isFieldFileLike(initial) ? !initial.isEmpty : !!initial
    if (realUpload && clear) {
      throw new ValidationError('Please either submit a file or check the clear checkbox, not both.', {
        code: 'contradiction',
      })
    }
    if (clear) {
      if (this.required) throw new ValidationError(REQUIRED_MESSAGE, { code: 'required' })
      return null
    }
    if (!realUpload) {
      if (this.required && !hasInitial) throw new ValidationError(REQUIRED_MESSAGE, { code: 'required' })
      return undefined // unchanged
    }
    for (const v of this.validators) await v(realUpload, form)
    return realUpload
  }

  /** Convert a non-empty input value with the model field (or as-is). */
  protected async toPython(value: unknown): Promise<unknown> {
    const f = this.modelField as any
    if (this.choices && !this.isRelation && !this.multiple && this.widget !== 'checkbox') {
      const ok = this.choices.some((c) => c.value === String(value))
      if (!ok) {
        throw new ValidationError(
          `Select a valid choice. ${String(value)} is not one of the available choices.`,
          {
            code: 'invalid_choice',
          },
        )
      }
    }
    if (this.widget === 'json') {
      try {
        return JSON.parse(String(value))
      } catch {
        throw new ValidationError('Enter a valid JSON.', { code: 'invalid' })
      }
    }
    if (!f) {
      if (this.multiple) return value
      return value
    }
    if (f.manyToMany) {
      const ids = value as string[]
      const pkField = f.relatedModel._meta.pk
      const converted: unknown[] = []
      for (const id of ids) {
        try {
          converted.push(pkField.toPython(id))
        } catch {
          throw new ValidationError(`“${id}” is not a valid value.`, { code: 'invalid_pk_value' })
        }
      }
      const unique = [...new Set(converted.map(String))]
      const qs = this.queryset ?? f.relatedModel._defaultManager.all()
      const found = (await qs.filter({ pk__in: converted }).valuesList('pk', { flat: true })) as unknown[]
      const foundSet = new Set(found.map(String))
      for (const id of unique) {
        if (!foundSet.has(id)) {
          throw new ValidationError(`Select a valid choice. ${id} is not one of the available choices.`, {
            code: 'invalid_choice',
          })
        }
      }
      return converted
    }
    if (f.isRelation) {
      let pk: unknown
      try {
        pk = f.toPython(value)
      } catch {
        throw invalidChoice()
      }
      const qs = this.queryset ?? f.relatedModel._defaultManager.all()
      const lookup = f.toField ? { [f.toField]: pk } : { pk }
      if (!(await qs.filter(lookup).exists())) throw invalidChoice()
      return pk
    }
    return f.toPython(value)
  }

  /** Render-ready value from a python value (unbound forms). */
  format(value: unknown): unknown {
    if (value === null || value === undefined) return this.multiple ? [] : ''
    if (this.multiple) return (Array.isArray(value) ? value : [value]).map(String)
    if (this.widget === 'checkbox') return !!value
    if (this.widget === 'file') return value
    if (this.widget === 'json') return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    if (value instanceof Date) {
      if (this.widget === 'date') return value.toISOString().slice(0, 10)
      return toDatetimeLocal(value)
    }
    if (typeof value === 'object' && value && 'pk' in (value as object)) return String((value as any).pk)
    return String(value)
  }
}

function invalidChoice(): ValidationError {
  return new ValidationError('Select a valid choice. That choice is not one of the available choices.', {
    code: 'invalid_choice',
  })
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true
  return Array.isArray(v) && v.length === 0
}

/** Comparable string for change detection. */
function normalize(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) return toDatetimeLocal(v)
  if (typeof File !== 'undefined' && v instanceof File) return `file:${v.name}:${v.size}:${Math.random()}`
  if (isFieldFileLike(v)) return v.isEmpty ? '' : String(v.name)
  if (Array.isArray(v)) return v.map(String).sort().join('\u0000')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export interface ModelFormOptions {
  model: ModelClass
  instance?: BaseModel
  fields: FormField[]
  data?: FormDataLike
  prefix?: string
  /** Extra initial values (override instance values). */
  initial?: Record<string, unknown>
  /** Extra forms of a formset may stay empty. */
  emptyPermitted?: boolean
  /** Form-wide validation (Django's `Form.clean`). Use `form.addError()` or throw ValidationError. */
  clean?: (form: ModelForm) => void | Promise<void>
  /** Model fields excluded from `fullClean()` (in addition to fields not on the form). */
  validationExclude?: string[]
  /** Called with the instance before `fullClean()` (e.g. to set the inline's foreign key). */
  beforeValidate?: (instance: BaseModel) => void
}

/** Django's ModelForm, for the admin. */
export class ModelForm {
  readonly model: ModelClass
  instance: BaseModel
  readonly fields: Map<string, FormField>
  readonly data: FormDataLike
  readonly isBound: boolean
  readonly prefix?: string
  readonly emptyPermitted: boolean
  errors: Record<string, string[]> = {}
  cleanedData: Record<string, unknown> = {}
  private initialValues: Record<string, unknown> = {}
  private extraInitial: Record<string, unknown>
  private cleaned = false
  private cleanHook?: (form: ModelForm) => void | Promise<void>
  private validationExclude: string[]
  private beforeValidate?: (instance: BaseModel) => void

  constructor(opts: ModelFormOptions) {
    this.model = opts.model
    this.instance = opts.instance ?? new (opts.model as any)()
    this.fields = new Map(opts.fields.map((f) => [f.name, f]))
    this.isBound = opts.data !== undefined
    this.data = opts.data ?? EMPTY_DATA
    this.prefix = opts.prefix
    this.emptyPermitted = opts.emptyPermitted ?? false
    this.extraInitial = opts.initial ?? {}
    this.cleanHook = opts.clean
    this.validationExclude = opts.validationExclude ?? []
    this.beforeValidate = opts.beforeValidate
  }

  /** Load choices and the instance's current values (M2M ids). Call before rendering / validating. */
  async init(): Promise<this> {
    for (const f of this.fields.values()) await f.prepare()
    const inst = this.instance as any
    const adding = this.instance._state.adding
    for (const f of this.fields.values()) {
      if (f.name in this.extraInitial) {
        this.initialValues[f.name] = this.extraInitial[f.name]
        continue
      }
      const mf = f.modelField as any
      if (!mf || f.virtual) {
        this.initialValues[f.name] = f.initial
        continue
      }
      if (mf.manyToMany) {
        if (!adding && inst.pk !== null && inst.pk !== undefined) {
          this.initialValues[f.name] = (await inst[mf.name]
            .all()
            .valuesList('pk', { flat: true })) as unknown[]
        } else {
          this.initialValues[f.name] = f.initial ?? []
        }
        continue
      }
      const v = mf.isRelation ? inst[mf.attname] : inst[mf.name]
      this.initialValues[f.name] = v === undefined ? f.initial : v
    }
    return this
  }

  addPrefix(name: string): string {
    return this.prefix ? `${this.prefix}-${name}` : name
  }

  /** Python initial value of a field. */
  initialFor(name: string): unknown {
    return this.initialValues[name]
  }

  /** Value to render in the widget. */
  valueFor(name: string): unknown {
    const f = this.fields.get(name)
    if (!f) return ''
    const html = this.addPrefix(name)
    if (!this.isBound || f.disabled || f.widget === 'file') return f.format(this.initialFor(name))
    if (f.widget === 'checkbox') {
      const v = this.data.get(html)
      return v !== null && !['false', 'False', '0'].includes(String(v))
    }
    if (f.widget === 'raw-id-multiple') return String(this.data.get(html) ?? '')
    if (f.multiple) return this.data.getAll(html).map(String)
    if (f.widget === 'password') return ''
    const v = this.data.get(html)
    return v === null ? '' : String(v)
  }

  addError(field: string | null, message: string | string[]): void {
    const key = field && this.fields.has(field) ? field : '__all__'
    const msgs = Array.isArray(message) ? message : [message]
    this.errors[key] = [...(this.errors[key] ?? []), ...msgs]
    if (key !== '__all__') delete this.cleanedData[key]
  }

  nonFieldErrors(): string[] {
    return this.errors.__all__ ?? []
  }

  /** Did the submitted data differ from the initial values? (Formset extra forms.) */
  hasChanged(): boolean {
    return this.changedData().length > 0
  }

  /** Names of fields whose submitted value differs from the initial value. */
  changedData(): string[] {
    if (!this.isBound) return []
    const out: string[] = []
    for (const f of this.fields.values()) {
      if (f.disabled || f.isHidden) continue
      const html = this.addPrefix(f.name)
      const initial = this.initialFor(f.name)
      if (f.widget === 'file') {
        const up = this.data.getAll(html).find((v) => typeof v !== 'string' && v.size > 0)
        if (up || this.data.has(`${html}-clear`)) out.push(f.name)
        continue
      }
      let current: unknown
      if (f.name in this.cleanedData) current = this.cleanedData[f.name]
      else if (f.widget === 'checkbox') current = this.valueFor(f.name)
      else if (f.multiple) current = this.valueFor(f.name)
      else current = this.data.get(html) ?? ''
      let init = initial
      if (f.widget === 'checkbox') {
        init = !!initial
        current = !!current
      }
      if (f.widget === 'json' && typeof current === 'string') {
        try {
          current = JSON.parse(current)
        } catch {}
      }
      if (normalize(init) !== normalize(current)) out.push(f.name)
    }
    return out
  }

  /** Validate: field cleaning, the form `clean` hook, then the model's `fullClean()`. */
  async isValid(): Promise<boolean> {
    if (!this.isBound) return false
    if (!this.cleaned) await this.fullClean()
    return Object.keys(this.errors).length === 0
  }

  async fullClean(): Promise<void> {
    this.cleaned = true
    this.errors = {}
    this.cleanedData = {}
    if (this.emptyPermitted && !this.hasChanged()) return
    for (const f of this.fields.values()) {
      const html = this.addPrefix(f.name)
      try {
        const v = await f.clean(this.data.getAll(html), this, html)
        this.cleanedData[f.name] = v
      } catch (e) {
        if (e instanceof ValidationError)
          this.errors[f.name] = [...(this.errors[f.name] ?? []), ...e.messages]
        else throw e
      }
    }
    if (this.cleanHook) {
      try {
        await this.cleanHook(this)
      } catch (e) {
        if (e instanceof ValidationError) {
          for (const [k, msgs] of Object.entries(e.toDict('__all__')))
            this.addError(k === '__all__' ? null : k, msgs)
        } else throw e
      }
    }
    await this.postClean()
  }

  /** Copy cleaned values to the instance and run model validation (Django's `_post_clean`). */
  private async postClean(): Promise<void> {
    const meta = this.model._meta
    const inst = this.instance as any
    this.constructInstance()
    this.beforeValidate?.(this.instance)
    const exclude = new Set<string>(this.validationExclude)
    for (const f of [...meta.fields, ...meta.manyToMany]) {
      const ff = this.fields.get(f.name)
      if (!ff || ff.virtual || ff.disabled || this.errors[f.name]) exclude.add(f.name)
    }
    try {
      await inst.fullClean({ exclude: [...exclude] })
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e
      for (const [k, msgs] of Object.entries(e.toDict('__all__'))) {
        const key = this.fields.has(k) ? k : '__all__'
        this.errors[key] = [...(this.errors[key] ?? []), ...msgs]
      }
    }
  }

  private constructInstance(): void {
    const inst = this.instance as any
    for (const f of this.fields.values()) {
      const mf = f.modelField as any
      if (!mf || f.virtual || f.disabled || mf.manyToMany || this.errors[f.name]) continue
      if (!(f.name in this.cleanedData)) continue
      const v = this.cleanedData[f.name]
      if (f.widget === 'file') {
        if (v === undefined) continue
        inst[mf.name] = v
        continue
      }
      if (mf.isRelation) inst[mf.attname] = v
      else inst[mf.name] = v
    }
  }

  /** Save the instance (and, with `commit`, its many-to-many values). */
  async save(commit = true): Promise<BaseModel> {
    if (Object.keys(this.errors).length) {
      throw new Error(
        `The ${this.model._meta.objectName} could not be saved because the data didn't validate.`,
      )
    }
    if (commit) {
      await this.instance.save()
      await this.saveM2M()
    }
    return this.instance
  }

  async saveM2M(): Promise<void> {
    const inst = this.instance as any
    for (const f of this.fields.values()) {
      const mf = f.modelField as any
      if (!mf?.manyToMany || f.disabled || f.virtual || !(f.name in this.cleanedData)) continue
      await inst[mf.name].set((this.cleanedData[f.name] as unknown[]) ?? [])
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Inline formsets
// ---------------------------------------------------------------------------------------------

export const TOTAL_FORM_COUNT = 'TOTAL_FORMS'
export const INITIAL_FORM_COUNT = 'INITIAL_FORMS'
export const MIN_NUM_FORM_COUNT = 'MIN_NUM_FORMS'
export const MAX_NUM_FORM_COUNT = 'MAX_NUM_FORMS'
export const DELETION_FIELD_NAME = 'DELETE'
const ABSOLUTE_MAX = 1000

export interface InlineFormSetOptions {
  model: ModelClass
  parent: BaseModel
  fkName: string
  prefix: string
  fields: FormField[]
  queryset: QuerySet<any>
  data?: FormDataLike
  extra: number
  minNum: number
  maxNum: number
  canDelete: boolean
  /** Existing rows can't be changed (view-only users / no change permission). */
  readonly?: boolean
  canAdd?: boolean
  /** "Save as new": every submitted row becomes a new object (Django's `save_as_new`). */
  saveAsNew?: boolean
}

export interface FormsetSaveResult {
  newObjects: BaseModel[]
  changedObjects: Array<[BaseModel, string[]]>
  deletedObjects: BaseModel[]
}

/** Django's BaseInlineFormSet. */
export class InlineFormSet {
  readonly opts: InlineFormSetOptions
  forms: ModelForm[] = []
  emptyForm!: ModelForm
  nonFormErrors: string[] = []
  initialObjects: BaseModel[] = []
  readonly isBound: boolean
  private validated: boolean | null = null

  constructor(opts: InlineFormSetOptions) {
    this.opts = opts
    this.isBound = opts.data !== undefined
  }

  get prefix(): string {
    return this.opts.prefix
  }

  get data(): FormDataLike {
    return this.opts.data ?? EMPTY_DATA
  }

  get pkName(): string {
    return this.opts.model._meta.pk.name
  }

  private mgmt(name: string): string {
    return `${this.prefix}-${name}`
  }

  initialFormCount(): number {
    if (this.opts.saveAsNew) return 0
    if (this.isBound) {
      const n = Number.parseInt(String(this.data.get(this.mgmt(INITIAL_FORM_COUNT)) ?? ''), 10)
      return Number.isFinite(n) ? Math.max(0, Math.min(n, ABSOLUTE_MAX)) : 0
    }
    return this.initialObjects.length
  }

  totalFormCount(): number {
    if (this.isBound) {
      const n = Number.parseInt(String(this.data.get(this.mgmt(TOTAL_FORM_COUNT)) ?? ''), 10)
      return Number.isFinite(n) ? Math.max(0, Math.min(n, ABSOLUTE_MAX)) : 0
    }
    const initial = this.initialObjects.length
    let total = Math.max(initial, this.opts.minNum) + (this.opts.canAdd === false ? 0 : this.opts.extra)
    if (initial > this.opts.maxNum) total = initial
    else if (total > this.opts.maxNum) total = this.opts.maxNum
    return total
  }

  managementValues(): Record<string, string> {
    return {
      [this.mgmt(TOTAL_FORM_COUNT)]: String(this.totalFormCount()),
      [this.mgmt(INITIAL_FORM_COUNT)]: String(this.initialFormCount()),
      [this.mgmt(MIN_NUM_FORM_COUNT)]: String(this.opts.minNum),
      [this.mgmt(MAX_NUM_FORM_COUNT)]: String(this.opts.maxNum),
    }
  }

  private fieldsFor(readonly: boolean): FormField[] {
    if (!readonly) return this.opts.fields
    return this.opts.fields.map((f) =>
      Object.assign(Object.create(Object.getPrototypeOf(f)), f, { disabled: true }),
    )
  }

  private makeForm(i: number | '__prefix__', instance?: BaseModel, emptyPermitted = false, readonly = false) {
    return new ModelForm({
      model: this.opts.model,
      instance,
      fields: this.fieldsFor(readonly),
      data: i === '__prefix__' ? undefined : this.opts.data,
      prefix: `${this.prefix}-${i}`,
      emptyPermitted,
      validationExclude: [this.opts.fkName],
      beforeValidate: (inst) => {
        const fk = this.opts.model._meta.getForwardField(this.opts.fkName) as any
        if (this.opts.parent.pk !== null && this.opts.parent.pk !== undefined) {
          ;(inst as any)[fk.attname] = (this.opts.parent as any)[fk.targetField.attname]
        }
      },
    })
  }

  async init(): Promise<this> {
    const parent = this.opts.parent
    if (!parent._state.adding && parent.pk !== null && parent.pk !== undefined) {
      this.initialObjects = (await this.opts.queryset.filter({
        [this.opts.fkName]: parent.pk,
      })) as BaseModel[]
    }
    if (this.isBound && this.data.get(this.mgmt(TOTAL_FORM_COUNT)) === null) {
      this.nonFormErrors.push(
        'ManagementForm data is missing or has been tampered with. Missing fields: ' +
          `${this.mgmt(TOTAL_FORM_COUNT)}, ${this.mgmt(INITIAL_FORM_COUNT)}. You may need to file a bug report if the issue persists.`,
      )
    }
    const byPk = new Map(this.initialObjects.map((o) => [String(o.pk), o]))
    const initialCount = this.initialFormCount()
    const total = this.totalFormCount()
    for (let i = 0; i < total; i++) {
      let instance: BaseModel | undefined
      if (i < initialCount) {
        if (this.isBound) {
          const pk = this.data.get(`${this.prefix}-${i}-${this.pkName}`)
          instance = pk === null ? undefined : byPk.get(String(pk))
          if (!instance) {
            this.nonFormErrors.push('Please correct the duplicate or invalid data below.')
            continue
          }
        } else {
          instance = this.initialObjects[i]
        }
      }
      const emptyPermitted = i >= initialCount && i >= this.opts.minNum
      this.forms.push(
        await this.makeForm(i, instance, emptyPermitted, i < initialCount && !!this.opts.readonly).init(),
      )
    }
    this.emptyForm = await this.makeForm('__prefix__', undefined, true).init()
    return this
  }

  isInitial(form: ModelForm): boolean {
    return !form.instance._state.adding
  }

  shouldDelete(form: ModelForm): boolean {
    if (!this.opts.canDelete || !this.isBound) return false
    const v = this.data.get(form.addPrefix(DELETION_FIELD_NAME))
    return v !== null && !['false', 'False', '0', ''].includes(String(v))
  }

  async isValid(): Promise<boolean> {
    if (!this.isBound) return false
    if (this.validated !== null) return this.validated
    let ok = this.nonFormErrors.length === 0
    let count = 0
    for (const form of this.forms) {
      if (this.shouldDelete(form)) continue
      if (this.isInitial(form) && this.opts.readonly) {
        count++
        continue
      }
      if (!(await form.isValid()) && !(form.emptyPermitted && !form.hasChanged())) ok = false
      if (this.isInitial(form) || form.hasChanged()) count++
    }
    if (count > this.opts.maxNum) {
      this.nonFormErrors.push(
        `Please submit at most ${this.opts.maxNum} form${this.opts.maxNum === 1 ? '' : 's'}.`,
      )
      ok = false
    }
    this.validated = ok
    return ok
  }

  /** Errors of every form, in order (for the error count in the page header). */
  get errorCount(): number {
    let n = this.nonFormErrors.length
    for (const f of this.forms) n += Object.keys(f.errors).length
    return n
  }

  /** Save new / changed rows and delete marked rows. */
  async save(): Promise<FormsetSaveResult> {
    const result: FormsetSaveResult = { newObjects: [], changedObjects: [], deletedObjects: [] }
    const fk = this.opts.model._meta.getForwardField(this.opts.fkName) as any
    for (const form of this.forms) {
      if (this.isInitial(form)) {
        if (this.shouldDelete(form)) {
          await form.instance.delete()
          result.deletedObjects.push(form.instance)
          continue
        }
        if (this.opts.readonly) continue
        const changed = form.changedData()
        if (!changed.length) continue
        await form.save()
        result.changedObjects.push([form.instance, changed])
        continue
      }
      if (this.shouldDelete(form) || !form.hasChanged() || this.opts.canAdd === false) continue
      ;(form.instance as any)[fk.attname] = (this.opts.parent as any)[fk.targetField.attname]
      await form.save()
      result.newObjects.push(form.instance)
    }
    return result
  }
}
