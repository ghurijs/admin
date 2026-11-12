// Changelist filters (Django's django.contrib.admin.filters).
import { type Field, type ModelClass, Q, type QuerySet } from '@ghuri/orm'
import type { Context } from 'hono'
import type { ChangeList } from './changelist'
import type { ModelAdmin } from './options'
import { addDays, capfirst, getFieldsFromPath, objectRepr, todayString } from './utils'

export interface FilterChoice {
  selected: boolean
  queryString: string
  display: string
}

/** Filter parameters still unclaimed by a filter (filters remove what they use). */
export type FilterParams = Map<string, string>

/** Base class of changelist filters. */
export abstract class ListFilter {
  /** Heading shown as “By <title>”. */
  title = ''
  /** Parameters this filter consumed. */
  usedParameters = new Map<string, string>()

  constructor(
    readonly c: Context,
    readonly params: FilterParams,
    readonly model: ModelClass,
    readonly modelAdmin: ModelAdmin<any>,
  ) {}

  /** Claim parameters and load lookups (called once by the changelist). */
  async init(): Promise<void> {
    for (const p of this.expectedParameters()) {
      if (this.params.has(p)) {
        this.usedParameters.set(p, this.params.get(p)!)
        this.params.delete(p)
      }
    }
  }

  /** Should the filter be displayed? */
  abstract hasOutput(): boolean
  /** Links shown in the sidebar. */
  abstract choices(cl: ChangeList): FilterChoice[] | Promise<FilterChoice[]>
  /**
   * Filtered queryset (or the same one when inactive). Return it synchronously: QuerySets are thenable,
   * so an `async` method would resolve it (return `{ qs }` from async code instead).
   */
  abstract queryset(
    c: Context,
    qs: QuerySet<any>,
  ): QuerySet<any> | null | Promise<{ qs: QuerySet<any> } | null>
  /** Query string parameter names this filter uses. */
  abstract expectedParameters(): string[]
}

/**
 * Django's SimpleListFilter. Subclass it and implement `lookups()` and `queryset()`:
 *
 * ```ts
 * class DecadeFilter extends SimpleListFilter {
 *   title = 'decade born'
 *   parameterName = 'decade'
 *   lookups() { return [['80s', 'in the eighties'], ['90s', 'in the nineties']] }
 *   queryset(c, qs) {
 *     if (this.value() === '80s') return qs.filter({ birthday__gte: '1980-01-01', birthday__lt: '1990-01-01' })
 *     return qs
 *   }
 * }
 * ```
 */
export abstract class SimpleListFilter extends ListFilter {
  parameterName = ''
  lookupChoices: Array<[unknown, string]> = []

  override async init(): Promise<void> {
    if (!this.parameterName) {
      throw new Error(`The list filter '${this.constructor.name}' does not specify a 'parameterName'.`)
    }
    if (!this.title) throw new Error(`The list filter '${this.constructor.name}' does not specify a 'title'.`)
    await super.init()
    this.lookupChoices = [...((await this.lookups(this.c, this.modelAdmin)) ?? [])]
  }

  /** `[value, label]` pairs for the links. */
  abstract lookups(
    c: Context,
    modelAdmin: ModelAdmin<any>,
  ): Array<[unknown, string]> | Promise<Array<[unknown, string]>> | null

  /** The selected value (or null). */
  value(): string | null {
    return this.usedParameters.get(this.parameterName) ?? null
  }

  hasOutput(): boolean {
    return this.lookupChoices.length > 0
  }

  expectedParameters(): string[] {
    return [this.parameterName]
  }

  choices(cl: ChangeList): FilterChoice[] {
    const v = this.value()
    return [
      { selected: v === null, queryString: cl.getQueryString({}, [this.parameterName]), display: 'All' },
      ...this.lookupChoices.map(([value, label]) => ({
        selected: v === String(value),
        queryString: cl.getQueryString({ [this.parameterName]: String(value) }),
        display: label,
      })),
    ]
  }
}

type FieldFilterClass = new (
  field: Field<any, any>,
  c: Context,
  params: FilterParams,
  model: ModelClass,
  modelAdmin: ModelAdmin<any>,
  fieldPath: string,
) => FieldListFilter

const registry: Array<{ test: (f: any) => boolean; cls: FieldFilterClass }> = []

/** Base class of field-based filters (`listFilter = ['published']`). */
export abstract class FieldListFilter extends ListFilter {
  constructor(
    readonly field: Field<any, any>,
    c: Context,
    params: FilterParams,
    model: ModelClass,
    modelAdmin: ModelAdmin<any>,
    readonly fieldPath: string,
  ) {
    super(c, params, model, modelAdmin)
    this.title = (field as any).verboseName ?? fieldPath
  }

  hasOutput(): boolean {
    return true
  }

  /** Apply the used parameters as ORM lookups. */
  queryset(_c: Context, qs: QuerySet<any>): QuerySet<any> {
    const lookup: Record<string, unknown> = {}
    for (const [k, v] of this.usedParameters) lookup[k] = prepareLookupValue(k, v)
    return Object.keys(lookup).length ? qs.filter(lookup) : qs
  }

  /** Register a filter class for fields matching `test` (Django's `FieldListFilter.register`). */
  static register(test: (field: any) => boolean, cls: FieldFilterClass, takePriority = false): void {
    if (takePriority) registry.unshift({ test, cls })
    else registry.push({ test, cls })
  }

  static create(
    field: Field<any, any>,
    c: Context,
    params: FilterParams,
    model: ModelClass,
    modelAdmin: ModelAdmin<any>,
    fieldPath: string,
  ): FieldListFilter {
    for (const { test, cls } of registry) {
      if (test(field)) return new cls(field, c, params, model, modelAdmin, fieldPath)
    }
    return new AllValuesFieldListFilter(field, c, params, model, modelAdmin, fieldPath)
  }
}

/** Django's `prepare_lookup_value`: `__in` → list, `__isnull` → boolean. */
export function prepareLookupValue(key: string, value: string): unknown {
  if (key.endsWith('__in')) return value.split(',')
  if (key.endsWith('__isnull')) return !['', 'false', '0'].includes(value.toLowerCase())
  return value
}

const EMPTY_LABEL = (ma: ModelAdmin<any>) => ma.getEmptyValueDisplay()

/** FK / O2O / M2M / reverse relations: one link per related object. */
export class RelatedFieldListFilter extends FieldListFilter {
  lookupKwarg = ''
  lookupKwargIsnull = ''
  lookupChoices: Array<[string, string]> = []
  emptyValueDisplay = ''

  override async init(): Promise<void> {
    const f = this.field as any
    const relModel: ModelClass = f.relatedModel
    const targetName =
      f.internalType === 'RelatedObject'
        ? relModel._meta.pk.name
        : (f.targetField?.name ?? relModel._meta.pk.name)
    this.lookupKwarg = `${this.fieldPath}__${targetName}__exact`
    this.lookupKwargIsnull = `${this.fieldPath}__isnull`
    await super.init()
    this.title = f.internalType === 'RelatedObject' ? relModel._meta.verboseName : f.verboseName
    this.emptyValueDisplay = EMPTY_LABEL(this.modelAdmin)
    this.lookupChoices = await this.fieldChoices()
  }

  get includeEmptyChoice(): boolean {
    const f = this.field as any
    return f.null || f.internalType === 'RelatedObject' || !!f.manyToMany
  }

  protected async fieldChoices(): Promise<Array<[string, string]>> {
    const relModel: ModelClass = (this.field as any).relatedModel
    let qs = relModel._defaultManager.all()
    const relatedAdmin = this.modelAdmin.adminSite.getModelAdmin(relModel)
    const ordering = relatedAdmin ? relatedAdmin.getOrdering(this.c) : []
    if (ordering.length) qs = qs.orderBy(...ordering)
    const limit = (this.field as any).limitChoicesTo
    if (limit && (this.field as any).internalType !== 'RelatedObject') qs = qs.filter(limit)
    const objs = (await qs.slice(0, 1000)) as any[]
    return objs.map((o) => [String(o.pk), objectRepr(o)])
  }

  hasOutput(): boolean {
    return this.lookupChoices.length + (this.includeEmptyChoice ? 1 : 0) > 1
  }

  expectedParameters(): string[] {
    return [this.lookupKwarg, this.lookupKwargIsnull]
  }

  choices(cl: ChangeList): FilterChoice[] {
    const val = this.usedParameters.get(this.lookupKwarg)
    const isnull = this.usedParameters.get(this.lookupKwargIsnull)
    const out: FilterChoice[] = [
      {
        selected: val === undefined && !isnull,
        queryString: cl.getQueryString({}, [this.lookupKwarg, this.lookupKwargIsnull]),
        display: 'All',
      },
    ]
    for (const [pk, label] of this.lookupChoices) {
      out.push({
        selected: val === pk,
        queryString: cl.getQueryString({ [this.lookupKwarg]: pk }, [this.lookupKwargIsnull]),
        display: label,
      })
    }
    if (this.includeEmptyChoice) {
      out.push({
        selected: !!isnull,
        queryString: cl.getQueryString({ [this.lookupKwargIsnull]: 'True' }, [this.lookupKwarg]),
        display: this.emptyValueDisplay,
      })
    }
    return out
  }
}

/** Only related objects that are actually used (Django's RelatedOnlyFieldListFilter). */
export class RelatedOnlyFieldListFilter extends RelatedFieldListFilter {
  protected override async fieldChoices(): Promise<Array<[string, string]>> {
    const pkQs = this.modelAdmin.getQueryset(this.c).distinct().orderBy()
    const used = (await pkQs.valuesList(`${this.fieldPath}__pk`, { flat: true })) as unknown[]
    const ids = [...new Set(used.filter((v) => v !== null && v !== undefined).map(String))]
    if (!ids.length) return []
    const relModel: ModelClass = (this.field as any).relatedModel
    const objs = (await relModel._defaultManager.filter({ pk__in: ids })) as any[]
    return objs.map((o) => [String(o.pk), objectRepr(o)])
  }
}

/** Booleans: All / Yes / No (/ Unknown). */
export class BooleanFieldListFilter extends FieldListFilter {
  get lookupKwarg() {
    return `${this.fieldPath}__exact`
  }
  get lookupKwarg2() {
    return `${this.fieldPath}__isnull`
  }

  expectedParameters(): string[] {
    return [this.lookupKwarg, this.lookupKwarg2]
  }

  choices(cl: ChangeList): FilterChoice[] {
    const v = this.usedParameters.get(this.lookupKwarg)
    const v2 = this.usedParameters.get(this.lookupKwarg2)
    const fieldChoices = this.field.choices
      ? new Map(this.field.choices.map(([k, l]) => [String(k), l]))
      : null
    const opts: Array<[string | undefined, string]> = [
      [undefined, 'All'],
      ['1', fieldChoices?.get('true') ?? 'Yes'],
      ['0', fieldChoices?.get('false') ?? 'No'],
    ]
    const out = opts.map(([lookup, title]) => ({
      selected: v === lookup && !v2,
      queryString: cl.getQueryString(lookup === undefined ? {} : { [this.lookupKwarg]: lookup }, [
        this.lookupKwarg2,
        ...(lookup === undefined ? [this.lookupKwarg] : []),
      ]),
      display: title,
    }))
    if (this.field.null) {
      out.push({
        selected: v2 === 'True',
        queryString: cl.getQueryString({ [this.lookupKwarg2]: 'True' }, [this.lookupKwarg]),
        display: 'Unknown',
      })
    }
    return out
  }
}

/** Fields with `choices`. */
export class ChoicesFieldListFilter extends FieldListFilter {
  get lookupKwarg() {
    return `${this.fieldPath}__exact`
  }
  get lookupKwargIsnull() {
    return `${this.fieldPath}__isnull`
  }

  expectedParameters(): string[] {
    return [this.lookupKwarg, this.lookupKwargIsnull]
  }

  choices(cl: ChangeList): FilterChoice[] {
    const v = this.usedParameters.get(this.lookupKwarg)
    const isnull = this.usedParameters.get(this.lookupKwargIsnull)
    const out: FilterChoice[] = [
      {
        selected: v === undefined && !isnull,
        queryString: cl.getQueryString({}, [this.lookupKwarg, this.lookupKwargIsnull]),
        display: 'All',
      },
    ]
    let noneTitle = ''
    for (const [value, label] of this.field.choices ?? []) {
      if (value === null || value === undefined) {
        noneTitle = label
        continue
      }
      out.push({
        selected: v === String(value),
        queryString: cl.getQueryString({ [this.lookupKwarg]: String(value) }, [this.lookupKwargIsnull]),
        display: label,
      })
    }
    if (noneTitle || this.field.null) {
      out.push({
        selected: !!isnull,
        queryString: cl.getQueryString({ [this.lookupKwargIsnull]: 'True' }, [this.lookupKwarg]),
        display: noneTitle || EMPTY_LABEL(this.modelAdmin),
      })
    }
    return out
  }
}

/** Dates: Any date / Today / Past 7 days / This month / This year (/ No date / Has date). */
export class DateFieldListFilter extends FieldListFilter {
  get fieldGenericPrefix() {
    return `${this.fieldPath}__`
  }
  get lookupSince() {
    return `${this.fieldPath}__gte`
  }
  get lookupUntil() {
    return `${this.fieldPath}__lt`
  }
  get lookupIsnull() {
    return `${this.fieldPath}__isnull`
  }

  expectedParameters(): string[] {
    const out = [this.lookupSince, this.lookupUntil]
    if (this.field.null) out.push(this.lookupIsnull)
    return out
  }

  links(): Array<[string, Record<string, string>]> {
    const today = todayString()
    const [y, m] = today.split('-')
    const firstOfMonth = `${y}-${m}-01`
    const nextMonthDate = new Date(`${firstOfMonth}T00:00:00Z`)
    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1)
    const nextMonth = todayString(nextMonthDate)
    const links: Array<[string, Record<string, string>]> = [
      ['Any date', {}],
      ['Today', { [this.lookupSince]: today, [this.lookupUntil]: addDays(today, 1) }],
      ['Past 7 days', { [this.lookupSince]: addDays(today, -7), [this.lookupUntil]: addDays(today, 1) }],
      ['This month', { [this.lookupSince]: firstOfMonth, [this.lookupUntil]: nextMonth }],
      ['This year', { [this.lookupSince]: `${y}-01-01`, [this.lookupUntil]: `${Number(y) + 1}-01-01` }],
    ]
    if (this.field.null) {
      links.push(['No date', { [this.lookupIsnull]: 'True' }])
      links.push(['Has date', { [this.lookupIsnull]: 'False' }])
    }
    return links
  }

  choices(cl: ChangeList): FilterChoice[] {
    const used = Object.fromEntries(this.usedParameters)
    return this.links().map(([title, params]) => {
      const keys = Object.keys(params)
      const selected = keys.length === Object.keys(used).length && keys.every((k) => used[k] === params[k])
      return {
        selected,
        queryString: cl.getQueryString(params, [this.fieldGenericPrefix]),
        display: title,
      }
    })
  }
}

/** Every distinct value of the field. */
export class AllValuesFieldListFilter extends FieldListFilter {
  lookupChoices: unknown[] = []
  get lookupKwarg() {
    return `${this.fieldPath}__exact`
  }
  get lookupKwargIsnull() {
    return `${this.fieldPath}__isnull`
  }

  override async init(): Promise<void> {
    await super.init()
    const qs = this.modelAdmin.getQueryset(this.c).distinct().orderBy(this.fieldPath)
    this.lookupChoices = ((await qs.valuesList(this.fieldPath, { flat: true })) as unknown[]).slice(0, 500)
    this.lookupChoices = [
      ...new Map(this.lookupChoices.map((v) => [v === null ? null : String(v), v])).values(),
    ]
  }

  expectedParameters(): string[] {
    return [this.lookupKwarg, this.lookupKwargIsnull]
  }

  choices(cl: ChangeList): FilterChoice[] {
    const v = this.usedParameters.get(this.lookupKwarg)
    const isnull = this.usedParameters.get(this.lookupKwargIsnull)
    const out: FilterChoice[] = [
      {
        selected: v === undefined && !isnull,
        queryString: cl.getQueryString({}, [this.lookupKwarg, this.lookupKwargIsnull]),
        display: 'All',
      },
    ]
    let includeNone = false
    for (const val of this.lookupChoices) {
      if (val === null) {
        includeNone = true
        continue
      }
      const s = val instanceof Date ? val.toISOString() : String(val)
      out.push({
        selected: v === s,
        queryString: cl.getQueryString({ [this.lookupKwarg]: s }, [this.lookupKwargIsnull]),
        display: s,
      })
    }
    if (includeNone) {
      out.push({
        selected: !!isnull,
        queryString: cl.getQueryString({ [this.lookupKwargIsnull]: 'True' }, [this.lookupKwarg]),
        display: EMPTY_LABEL(this.modelAdmin),
      })
    }
    return out
  }
}

/** Empty / not empty (Django's EmptyFieldListFilter). Use as `['title', EmptyFieldListFilter]`. */
export class EmptyFieldListFilter extends FieldListFilter {
  get lookupKwarg() {
    return `${this.fieldPath}__isempty`
  }

  expectedParameters(): string[] {
    return [this.lookupKwarg]
  }

  override queryset(_c: Context, qs: QuerySet<any>): QuerySet<any> {
    const v = this.usedParameters.get(this.lookupKwarg)
    if (v === undefined) return qs
    const empty = v === '1'
    const f = this.field as any
    const conds: Array<Record<string, unknown>> = []
    if (f.emptyStringsAllowed && !f.isRelation) conds.push({ [this.fieldPath]: '' })
    if (f.null || f.isRelation) conds.push({ [`${this.fieldPath}__isnull`]: true })
    if (!conds.length) return qs
    if (empty) {
      let q = Q(conds[0])
      for (const cnd of conds.slice(1)) q = q.or(Q(cnd))
      return qs.filter(q)
    }
    let out = qs
    for (const cnd of conds) out = out.exclude(cnd)
    return out
  }

  choices(cl: ChangeList): FilterChoice[] {
    const v = this.usedParameters.get(this.lookupKwarg)
    return [
      [undefined, 'All'],
      ['1', 'Empty'],
      ['0', 'Not empty'],
    ].map(([lookup, title]) => ({
      selected: v === lookup,
      queryString: cl.getQueryString(
        lookup === undefined ? {} : { [this.lookupKwarg]: lookup as string },
        lookup === undefined ? [this.lookupKwarg] : [],
      ),
      display: title as string,
    }))
  }
}

FieldListFilter.register((f) => f.isRelation || f.internalType === 'RelatedObject', RelatedFieldListFilter)
FieldListFilter.register(
  (f) => f.internalType === 'BooleanField' || f.internalType === 'NullBooleanField',
  BooleanFieldListFilter,
)
FieldListFilter.register((f) => !!f.choices, ChoicesFieldListFilter)
FieldListFilter.register(
  (f) => f.internalType === 'DateField' || f.internalType === 'DateTimeField',
  DateFieldListFilter,
)

/** Resolve a `listFilter` field path to its field (or throw). */
export function filterFieldFor(model: ModelClass, path: string): Field<any, any> {
  const chain = getFieldsFromPath(model, path)
  if (!chain) throw new Error(`${model._meta.objectName} has no field named '${path}' (listFilter).`)
  return chain[chain.length - 1]
}

export function filterTitle(f: ListFilter): string {
  return capfirst(f.title)
}
