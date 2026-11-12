// Django's ChangeList: filtering, searching, ordering and paginating the objects of a changelist page.
import type { BaseModel, ModelClass, QuerySet } from '@ghuri/orm'
import type { Context } from 'hono'
import { displayOptionsFor, type ListDisplayItem } from './display'
import {
  FieldListFilter,
  type FilterParams,
  filterFieldFor,
  type ListFilter,
  prepareLookupValue,
  type SimpleListFilter,
} from './filters'
import type { ModelAdmin } from './options'
import { getFieldsFromPath, LOOKUP_SEP, queryString } from './utils'

export const ALL_VAR = 'all'
export const ORDER_VAR = 'o'
export const PAGE_VAR = 'p'
export const SEARCH_VAR = 'q'
export const ERROR_FLAG = 'e'
export const IS_POPUP_VAR = '_popup'
export const TO_FIELD_VAR = '_to_field'
export const IGNORED_PARAMS = [
  ALL_VAR,
  ORDER_VAR,
  SEARCH_VAR,
  IS_POPUP_VAR,
  TO_FIELD_VAR,
  '_changelist_filters',
]

export const ACTION_CHECKBOX = 'action_checkbox'

/** Bad query string parameters (Django's IncorrectLookupParameters → `?e=1`). */
export class IncorrectLookupParameters extends Error {}

export type ListFilterItem =
  | string
  | (new (
      ...args: any[]
    ) => SimpleListFilter)
  | [string, new (...args: any[]) => FieldListFilter]

export interface ChangeListOptions {
  listDisplay: ListDisplayItem[]
  listDisplayLinks: ListDisplayItem[] | null
  listFilter: ListFilterItem[]
  dateHierarchy: string | null
  searchFields: string[]
  listSelectRelated: boolean | string[]
  listPerPage: number
  listMaxShowAll: number
  listEditable: string[]
  sortableBy: string[] | null
  searchHelpText: string | null
}

export interface DateHierarchyState {
  field: string
  year?: number
  month?: number
  day?: number
}

export class ChangeList {
  readonly model: ModelClass
  readonly params: URLSearchParams
  readonly query: string
  readonly page: number
  readonly showAll: boolean
  readonly listDisplay: ListDisplayItem[]
  readonly listDisplayLinks: ListDisplayItem[]
  filterSpecs: ListFilter[] = []
  hasFilters = false
  hasActiveFilters = false
  clearAllFiltersQs = '?'
  rootQueryset!: QuerySet<any>
  queryset!: QuerySet<any>
  resultCount = 0
  fullResultCount: number | null = null
  resultList: BaseModel[] = []
  numPages = 1
  multiPage = false
  canShowAll = true
  ordering: string[] = []
  dateHierarchy: DateHierarchyState | null = null
  isPopup = false

  constructor(
    readonly c: Context,
    readonly modelAdmin: ModelAdmin<any>,
    readonly opts: ChangeListOptions,
  ) {
    this.model = modelAdmin.model
    const url = new URL(c.req.url)
    this.params = url.searchParams
    this.query = (this.params.get(SEARCH_VAR) ?? '').trim()
    const page = Number.parseInt(this.params.get(PAGE_VAR) ?? '1', 10)
    this.page = Number.isFinite(page) && page > 0 ? page : 1
    this.showAll = this.params.has(ALL_VAR)
    this.listDisplay = opts.listDisplay
    if (opts.listDisplayLinks === null) this.listDisplayLinks = []
    else this.listDisplayLinks = opts.listDisplayLinks ?? this.defaultLinks()
  }

  private defaultLinks(): ListDisplayItem[] {
    const first = this.listDisplay.find((d) => d !== ACTION_CHECKBOX)
    return first === undefined ? [] : [first]
  }

  getQueryString(
    set: Record<string, string | number | null | undefined> = {},
    remove: string[] = [],
  ): string {
    return queryString(this.params, set, remove)
  }

  /** Run filters, search, ordering and pagination. */
  async init(): Promise<this> {
    this.rootQueryset = this.modelAdmin.getQueryset(this.c)
    this.queryset = (await this.getQueryset()).qs
    await this.getResults()
    return this
  }

  private filterParams(): FilterParams {
    const out: FilterParams = new Map()
    for (const [k, v] of this.params) {
      if (IGNORED_PARAMS.includes(k) || k === PAGE_VAR || k === ERROR_FLAG) continue
      out.set(k, v)
    }
    return out
  }

  private async getFilters(): Promise<{ remaining: Map<string, string> }> {
    const params = this.filterParams()
    // Date hierarchy params are consumed first.
    if (this.opts.dateHierarchy) {
      const field = this.opts.dateHierarchy
      const year = params.get(`${field}__year`)
      const month = params.get(`${field}__month`)
      const day = params.get(`${field}__day`)
      for (const p of ['year', 'month', 'day']) params.delete(`${field}__${p}`)
      const num = (v: string | undefined) => (v === undefined ? undefined : Number.parseInt(v, 10))
      const state: DateHierarchyState = { field, year: num(year), month: num(month), day: num(day) }
      for (const v of [state.year, state.month, state.day]) {
        if (v !== undefined && !Number.isFinite(v))
          throw new IncorrectLookupParameters('Invalid date hierarchy value.')
      }
      this.dateHierarchy = state
    }
    const specs: ListFilter[] = []
    for (const item of this.opts.listFilter) {
      let spec: ListFilter
      if (typeof item === 'string') {
        const field = filterFieldFor(this.model, item)
        spec = FieldListFilter.create(field, this.c, params, this.model, this.modelAdmin, item)
      } else if (Array.isArray(item)) {
        const [path, cls] = item
        const field = filterFieldFor(this.model, path)
        spec = new (cls as any)(field, this.c, params, this.model, this.modelAdmin, path)
      } else {
        spec = new (item as any)(this.c, params, this.model, this.modelAdmin)
      }
      await spec.init()
      if (spec.hasOutput()) specs.push(spec)
      if (spec.usedParameters.size) this.hasActiveFilters = true
    }
    if (this.dateHierarchy && this.dateHierarchy.year !== undefined) this.hasActiveFilters = true
    this.filterSpecs = specs
    this.hasFilters = specs.length > 0
    for (const [k] of params) {
      if (!this.modelAdmin.lookupAllowed(k, params.get(k)!, this.c)) {
        throw new IncorrectLookupParameters(`Filtering by ${k} not allowed`)
      }
    }
    if (params.size) this.hasActiveFilters = true
    const removable = [...this.filterParams().keys()]
    this.clearAllFiltersQs = this.getQueryString({}, removable)
    return { remaining: params }
  }

  private dateHierarchyRange(): Record<string, unknown> | null {
    const dh = this.dateHierarchy
    if (!dh || dh.year === undefined) return null
    const { year, month, day } = dh
    const pad = (n: number) => String(n).padStart(2, '0')
    let from: string
    let to: string
    if (day !== undefined && month !== undefined) {
      from = `${year}-${pad(month)}-${pad(day)}`
      const d = new Date(`${from}T00:00:00Z`)
      if (Number.isNaN(d.getTime())) throw new IncorrectLookupParameters('Invalid date.')
      d.setUTCDate(d.getUTCDate() + 1)
      to = d.toISOString().slice(0, 10)
    } else if (month !== undefined) {
      if (month < 1 || month > 12) throw new IncorrectLookupParameters('Invalid month.')
      from = `${year}-${pad(month)}-01`
      to = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
    } else {
      from = `${year}-01-01`
      to = `${year + 1}-01-01`
    }
    if (!/^\d{4}-/.test(from)) throw new IncorrectLookupParameters('Invalid year.')
    return { [`${dh.field}__gte`]: from, [`${dh.field}__lt`]: to }
  }

  // Returns a wrapper: QuerySets are thenable, so an async function returning one would resolve it.
  private async getQueryset(): Promise<{ qs: QuerySet<any> }> {
    const { remaining } = await this.getFilters()
    let qs = this.rootQueryset
    try {
      for (const spec of this.filterSpecs) {
        const next = await resolveQueryset(spec.queryset(this.c, qs))
        if (next) qs = next.qs
      }
      const range = this.dateHierarchyRange()
      if (range) qs = qs.filter(range)
      const lookup: Record<string, unknown> = {}
      for (const [k, v] of remaining) lookup[k] = prepareLookupValue(k, v)
      if (Object.keys(lookup).length) qs = qs.filter(lookup)
    } catch (err) {
      if (err instanceof IncorrectLookupParameters) throw err
      throw new IncorrectLookupParameters(String((err as Error)?.message ?? err))
    }
    this.ordering = this.getOrdering()
    if (this.ordering.length) qs = qs.orderBy(...this.ordering)
    if (this.query) {
      const [searched] = await this.modelAdmin.getSearchResults(this.c, qs, this.query)
      qs = searched
    }
    return { qs }
  }

  /** Model field name or `ordering` of a callable column, or null when not sortable. */
  getOrderingField(name: ListDisplayItem): string | null {
    if (name === ACTION_CHECKBOX) return null
    if (typeof name === 'string') {
      const f = this.model._meta.getForwardField(name)
      if (f && !f.manyToMany) return f.name
      if (name === '__str__') return null
      if (name.includes(LOOKUP_SEP) && getFieldsFromPath(this.model, name)) return name
    }
    return displayOptionsFor(name, this.model, this.modelAdmin)?.ordering ?? null
  }

  isSortable(name: ListDisplayItem): boolean {
    if (this.getOrderingField(name) === null) return false
    const sortableBy = this.opts.sortableBy
    if (sortableBy === null) return true
    return typeof name === 'string' && sortableBy.includes(name)
  }

  private getOrdering(): string[] {
    let ordering = [...(this.modelAdmin.getOrdering(this.c) ?? this.model._meta.ordering ?? [])]
    if (!ordering.length) ordering = [...(this.model._meta.ordering ?? [])]
    const o = this.params.get(ORDER_VAR)
    if (o !== null) {
      ordering = []
      for (const part of o.split('.')) {
        const m = /^(-?)(\d+)$/.exec(part)
        if (!m) continue
        const idx = Number(m[2])
        const name = this.listDisplay[idx]
        if (name === undefined || !this.isSortable(name)) continue
        const field = this.getOrderingField(name)
        if (!field) continue
        if (field.startsWith('-') && m[1] === '-') ordering.push(field.slice(1))
        else if (m[1] === '-') ordering.push(field.startsWith('-') ? field.slice(1) : `-${field}`)
        else ordering.push(field)
      }
    }
    return this.deterministicOrdering(ordering)
  }

  /** Make sure the ordering is total by appending the pk (Django's `_get_deterministic_ordering`). */
  private deterministicOrdering(ordering: string[]): string[] {
    const meta = this.model._meta
    const pkName = meta.pk.name
    for (const o of ordering) {
      const name = o.replace(/^-/, '')
      if (name === 'pk' || name === pkName) return ordering
      const f = meta.getForwardField(name)
      if (f?.unique && !f.null) return ordering
    }
    return [...ordering, `-${pkName}`]
  }

  /** Column index → 'asc' | 'desc' for the current ordering (Django's `get_ordering_field_columns`). */
  getOrderingFieldColumns(): Map<number, 'asc' | 'desc'> {
    const out = new Map<number, 'asc' | 'desc'>()
    const o = this.params.get(ORDER_VAR)
    if (o === null) {
      for (const field of this.ordering) {
        const desc = field.startsWith('-')
        const name = field.replace(/^-/, '')
        this.listDisplay.forEach((d, i) => {
          if (out.has(i)) return
          if (this.getOrderingField(d) === name || this.getOrderingField(d) === `-${name}`) {
            out.set(i, desc ? 'desc' : 'asc')
          }
        })
      }
      return out
    }
    for (const part of o.split('.')) {
      const m = /^(-?)(\d+)$/.exec(part)
      if (!m) continue
      out.set(Number(m[2]), m[1] === '-' ? 'desc' : 'asc')
    }
    return out
  }

  private async getResults(): Promise<void> {
    const qs = this.queryset
    this.resultCount = await qs.count()
    const anyFilter = this.query !== '' || this.hasActiveFilters
    if (this.modelAdmin.showFullResultCount && anyFilter) {
      this.fullResultCount = await this.rootQueryset.count()
    } else if (!anyFilter) {
      this.fullResultCount = this.resultCount
    } else {
      this.fullResultCount = null
    }
    const perPage = Math.max(1, this.opts.listPerPage)
    this.canShowAll = this.resultCount <= this.opts.listMaxShowAll
    this.multiPage = this.resultCount > perPage
    this.numPages = Math.max(1, Math.ceil(this.resultCount / perPage))
    let page = qs
    const sr = this.opts.listSelectRelated
    if (sr === true) {
      const fks = this.model._meta.fields.filter((f) => f.isRelation && !f.manyToMany).map((f) => f.name)
      if (fks.length) page = page.selectRelated(...fks)
    } else if (Array.isArray(sr) && sr.length) {
      page = page.selectRelated(...sr)
    } else if (sr === false) {
      const fks = this.listDisplay
        .filter((d): d is string => typeof d === 'string')
        .map((d) => this.model._meta.getForwardField(d))
        .filter((f) => f?.isRelation && !f.manyToMany)
        .map((f) => f!.name)
      if (fks.length) page = page.selectRelated(...fks)
    }
    if (this.showAll && this.canShowAll) {
      this.resultList = (await page) as BaseModel[]
    } else {
      if (this.page > this.numPages) throw new IncorrectLookupParameters('Invalid page.')
      const start = (this.page - 1) * perPage
      this.resultList = (await page.slice(start, start + perPage)) as BaseModel[]
    }
  }

  /** Page numbers with '.' for gaps (Django's `get_elided_page_range`, 3 on each side, 2 at the ends). */
  pageRange(): Array<number | '…'> {
    const n = this.numPages
    const cur = this.page
    const onEachSide = 3
    const onEnds = 2
    if (n <= (onEachSide + onEnds) * 2) return Array.from({ length: n }, (_, i) => i + 1)
    const out: Array<number | '…'> = []
    if (cur > 1 + onEachSide + onEnds + 1) {
      for (let i = 1; i <= onEnds; i++) out.push(i)
      out.push('…')
      for (let i = cur - onEachSide; i < cur; i++) out.push(i)
    } else {
      for (let i = 1; i < cur; i++) out.push(i)
    }
    if (cur < n - onEachSide - onEnds) {
      for (let i = cur; i <= cur + onEachSide; i++) out.push(i)
      out.push('…')
      for (let i = n - onEnds + 1; i <= n; i++) out.push(i)
    } else {
      for (let i = cur; i <= n; i++) out.push(i)
    }
    return out
  }

  /** Query string of the current filters, used as `_changelist_filters` (Django's preserved filters). */
  preservedFilters(): string {
    const p = new URLSearchParams(this.params)
    for (const k of [...p.keys()]) if (k === ERROR_FLAG) p.delete(k)
    return p.toString()
  }
}

/** A filter's `queryset()` result: a QuerySet (sync), or a promise of `{ qs }` / null. */
async function resolveQueryset(result: unknown): Promise<{ qs: QuerySet<any> } | null> {
  if (result && (result as any)._isQuerySet) return { qs: result as QuerySet<any> }
  const v = await (result as Promise<unknown>)
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && (v as any).qs?._isQuerySet) return { qs: (v as any).qs }
  throw new Error(
    'A list filter queryset() returned a resolved list: return the QuerySet synchronously (QuerySets are thenable, so async functions resolve them).',
  )
}
