// Value lookup and display helpers (Django's admin.utils lookup_field / display_for_field).
import type { BaseModel, Field, ModelClass } from '@ghuri/orm'
import { isValidElement } from 'hono/jsx'
import { getDisplayOptions } from './decorators'
import type { ModelAdmin } from './options'
import {
  capfirst,
  formatDate,
  formatDateTime,
  formatTime,
  humanize,
  isFieldFileLike,
  isModelInstance,
  LOOKUP_SEP,
  objectRepr,
} from './utils'

export type ListDisplayItem = string | ((obj: any) => unknown)

export interface LookupResult {
  field?: Field<any, any>
  attr?: Function
  value: unknown
}

/** Is `v` already markup (JSX element or `html`/`raw` string)? */
export function isMarkup(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return false
  return isValidElement(v) || (v as any).isEscaped === true
}

function forwardField(model: ModelClass, name: string): Field<any, any> | undefined {
  return model._meta.getForwardField(name)
}

/** Resolve a `listDisplay` / `readonlyFields` entry for `obj`. */
export async function lookupField(
  name: ListDisplayItem,
  obj: BaseModel,
  modelAdmin?: ModelAdmin<any>,
): Promise<LookupResult> {
  if (typeof name === 'function') {
    return { attr: name, value: await name.call(modelAdmin, obj) }
  }
  if (name === '__str__') return { value: objectRepr(obj) }
  const ma = modelAdmin as any
  const model = obj.constructor as ModelClass
  if (ma && typeof ma[name] === 'function' && !forwardField(model, name)) {
    return { attr: ma[name], value: await ma[name](obj) }
  }
  if (name.includes(LOOKUP_SEP)) {
    let current: any = obj
    const parts = name.split(LOOKUP_SEP)
    let field: Field<any, any> | undefined
    for (let i = 0; i < parts.length; i++) {
      if (current === null || current === undefined) return { field, value: null }
      const f = forwardField(current.constructor as ModelClass, parts[i])
      field = f
      if (f?.isRelation && !f.manyToMany) current = await current[parts[i]]
      else if (f) current = current[f.name]
      else {
        const a = current[parts[i]]
        current = typeof a === 'function' ? await a.call(current) : await a
      }
    }
    return { field, value: current }
  }
  const field = forwardField(model, name)
  if (field) {
    const o = obj as any
    if (field.manyToMany) {
      const pk = (obj as any).pk
      if (pk === null || pk === undefined) return { field, value: [] }
      return { field, value: await o[field.name].all() }
    }
    if (field.isRelation) {
      if (o[field.attname] === null || o[field.attname] === undefined) return { field, value: null }
      try {
        return { field, value: await o[field.name] }
      } catch {
        return { field, value: null }
      }
    }
    return { field, value: o[field.name] }
  }
  const attr = (obj as any)[name]
  if (typeof attr === 'function') return { attr, value: await attr.call(obj) }
  if (attr === undefined && !(name in (obj as object))) {
    throw new Error(
      `Unable to lookup '${name}' on ${model._meta.objectName} or ${ma?.constructor?.name ?? 'ModelAdmin'}`,
    )
  }
  return { value: await attr }
}

/** Column header / label for a `listDisplay` / `readonlyFields` entry. */
export function labelForField(
  name: ListDisplayItem,
  model: ModelClass,
  modelAdmin?: ModelAdmin<any>,
): string {
  if (typeof name === 'function') {
    const d = getDisplayOptions(name)
    if (d?.description) return d.description
    return capfirst(humanize(name.name || '--'))
  }
  if (name === '__str__') return capfirst(model._meta.verboseName)
  const ma = modelAdmin as any
  const field = model._meta.getForwardField(name)
  if (field) return capfirst(field.verboseName)
  if (ma && typeof ma[name] === 'function') {
    const d = getDisplayOptions(ma[name])
    return d?.description ?? capfirst(humanize(name))
  }
  if (name.includes(LOOKUP_SEP)) {
    let current: ModelClass = model
    let f: any
    for (const part of name.split(LOOKUP_SEP)) {
      f = current._meta.getForwardField(part)
      if (!f) return capfirst(humanize(name.replace(/__/g, ' ')))
      if (f.isRelation) current = f.relatedModel
    }
    return capfirst(f.verboseName)
  }
  const proto = (model as any).prototype
  const attr = proto?.[name]
  const d = getDisplayOptions(attr)
  if (d?.description) return d.description
  if (name === 'pk') return 'ID'
  return capfirst(humanize(name))
}

/** Help text for a field / callable. */
export function helpTextFor(name: ListDisplayItem, model: ModelClass): string | undefined {
  if (typeof name !== 'string') return undefined
  return model._meta.getForwardField(name)?.helpText
}

/** Display options of a `listDisplay` entry (callables, ModelAdmin methods, model methods). */
export function displayOptionsFor(
  name: ListDisplayItem,
  model: ModelClass,
  modelAdmin?: ModelAdmin<any>,
): ReturnType<typeof getDisplayOptions> {
  if (typeof name === 'function') return getDisplayOptions(name)
  const ma = modelAdmin as any
  if (ma && typeof ma[name] === 'function') return getDisplayOptions(ma[name])
  return getDisplayOptions((model as any).prototype?.[name])
}

export function BooleanIcon({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <span class="icon-unknown" title="Unknown" role="img" aria-label="Unknown">
        ?
      </span>
    )
  }
  return value ? (
    <span class="icon-yes" title="True" role="img" aria-label="True">
      ✔
    </span>
  ) : (
    <span class="icon-no" title="False" role="img" aria-label="False">
      ✘
    </span>
  )
}

/** Render a value of a model field (Django's display_for_field). */
export function displayForField(value: unknown, field: Field<any, any>, emptyValueDisplay: string): unknown {
  const f = field as any
  if (f.choices && !f.isRelation) {
    const hit = f.choices.find(([v]: [unknown]) => v === value || String(v) === String(value))
    if (hit) return hit[1]
  }
  if (f.internalType === 'BooleanField' || f.internalType === 'NullBooleanField')
    return <BooleanIcon value={value} />
  if (value === null || value === undefined) return emptyValueDisplay
  if (isFieldFileLike(value)) {
    if (value.isEmpty) return emptyValueDisplay
    let url: string | null = null
    try {
      url = value.url
    } catch {}
    return url ? <a href={url}>{String(value.name)}</a> : String(value.name)
  }
  if (f.internalType === 'DateTimeField' && value instanceof Date) return formatDateTime(value)
  if (f.internalType === 'DateField') return formatDate(value as string)
  if (f.internalType === 'TimeField') return formatTime(String(value))
  if (f.internalType === 'JSONField') return JSON.stringify(value)
  if (f.manyToMany && Array.isArray(value))
    return value.length ? value.map(objectRepr).join(', ') : emptyValueDisplay
  if (f.internalType === 'URLField' && value) return <a href={String(value)}>{String(value)}</a>
  return displayForValue(value, emptyValueDisplay)
}

/** Render a computed value (Django's display_for_value). */
export function displayForValue(value: unknown, emptyValueDisplay: string, boolean = false): unknown {
  if (boolean) return <BooleanIcon value={value} />
  if (value === null || value === undefined || value === '') return emptyValueDisplay
  if (isMarkup(value)) return value
  if (typeof value === 'boolean') return String(value)
  if (value instanceof Date) return formatDateTime(value)
  if (Array.isArray(value))
    return value.map((v) => (isModelInstance(v) ? objectRepr(v) : String(v))).join(', ')
  if (isModelInstance(value)) return objectRepr(value)
  if (typeof value === 'object') {
    if (
      typeof (value as any).toString === 'function' &&
      (value as any).toString !== Object.prototype.toString
    )
      return String(value)
    return JSON.stringify(value)
  }
  return String(value)
}
