// Small helpers shared by the admin (Django's django.contrib.admin.utils and template filters).
import { tryGetContext } from '@ghuri/core'
import type { BaseModel, Field, ModelClass } from '@ghuri/orm'

export const LOOKUP_SEP = '__'

/** Upper-case the first character (Django's `capfirst`). */
export function capfirst(s: unknown): string {
  const str = String(s ?? '')
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** `'createdAt'` / `'created_at'` → `'created at'`. */
export function humanize(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim()
}

// Django's admin quote(): characters that would confuse URL parsing are escaped as `_XX`.
const QUOTE_RE = /[:/_#?;@&=+$,"[\]<>%\n\\]/g

/** Quote a primary key for use in an admin URL (Django's `quote`). */
export function quote(value: unknown): string {
  return String(value).replace(
    QUOTE_RE,
    (ch) => `_${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  )
}

/** Reverse of `quote()`. */
export function unquote(value: string): string {
  return value.replace(/_([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
}

/** `'1 post'` / `'2 posts'`. */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

export function modelNameFor(model: ModelClass, count = 1): string {
  return count === 1 ? model._meta.verboseName : model._meta.verboseNamePlural
}

/** Display text of a model instance (Django's `str(obj)`). */
export function objectRepr(obj: unknown): string {
  if (obj === null || obj === undefined) return ''
  try {
    return String(obj)
  } catch {
    return '?'
  }
}

/** Truncate to `n` characters (for LogEntry.objectRepr). */
export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s
}

/** Join `['a', 'b', 'c']` as `'a, b and c'` (Django's `get_text_list`). */
export function textList(items: string[], last = 'and'): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`
}

/** Is `fn` a (non-class) function? */
export function isFunction(v: unknown): v is (...args: any[]) => any {
  return typeof v === 'function' && !/^class[\s{]/.test(Function.prototype.toString.call(v))
}

/**
 * Follow a `__` path from `model` to the final forward field. Returns the chain of fields
 * (relations then the last field) or null when it doesn't exist.
 */
export function getFieldsFromPath(model: ModelClass, path: string): Field<any, any>[] | null {
  const parts = path.split(LOOKUP_SEP)
  const out: Field<any, any>[] = []
  let current: ModelClass = model
  for (let i = 0; i < parts.length; i++) {
    const name = parts[i]
    const f = current._meta.findField(name) as any
    if (!f) return null
    if (f.internalType === 'RelatedObject') {
      // reverse relation: continue from the related model
      out.push(f)
      current = f.relatedModel
      continue
    }
    out.push(f)
    if (i < parts.length - 1) {
      if (!f.isRelation) return null
      current = f.relatedModel
    }
  }
  return out
}

/** The model at the end of a relation path. */
export function getModelFromRelation(field: any): ModelClass {
  return field.relatedModel
}

export interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function timeZone(): string {
  const tz = tryGetContext()?.settings.TIME_ZONE
  return typeof tz === 'string' && tz ? tz : 'UTC'
}

/** Calendar parts of `d` in `TIME_ZONE` (UTC when unset or unsupported). */
export function dateParts(d: Date, tz = timeZone()): DateParts {
  if (tz !== 'UTC') {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hourCycle: 'h23',
      }).formatToParts(d)
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
      return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour') % 24,
        minute: get('minute'),
        second: get('second'),
      }
    } catch {
      // fall back to UTC
    }
  }
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
// Django's 'N' format (AP style month abbreviations).
const MONTHS_AP = [
  'Jan.',
  'Feb.',
  'March',
  'April',
  'May',
  'June',
  'July',
  'Aug.',
  'Sept.',
  'Oct.',
  'Nov.',
  'Dec.',
]

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month)
}

/** Django's `P` time format: `3:04 p.m.`, `3 p.m.`, `midnight`, `noon`. */
export function formatTimeP(hour: number, minute: number): string {
  if (minute === 0 && hour === 0) return 'midnight'
  if (minute === 0 && hour === 12) return 'noon'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour < 12 ? 'a.m.' : 'p.m.'
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${String(minute).padStart(2, '0')} ${suffix}`
}

/** Django's default DATE_FORMAT `N j, Y` → `Jan. 5, 2024`. */
export function formatDate(value: Date | string): string {
  let y: number
  let m: number
  let d: number
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (!match) return value
    y = Number(match[1])
    m = Number(match[2])
    d = Number(match[3])
  } else {
    const p = dateParts(value)
    y = p.year
    m = p.month
    d = p.day
  }
  return `${MONTHS_AP[m - 1]} ${d}, ${y}`
}

/** Django's default DATETIME_FORMAT `N j, Y, P` → `Jan. 5, 2024, 3:04 p.m.`. */
export function formatDateTime(value: Date): string {
  const p = dateParts(value)
  return `${MONTHS_AP[p.month - 1]} ${p.day}, ${p.year}, ${formatTimeP(p.hour, p.minute)}`
}

/** `'HH:MM:SS'` → Django's `P` format. */
export function formatTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value)
  return m ? formatTimeP(Number(m[1]), Number(m[2])) : value
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Value for `<input type="datetime-local">` (in TIME_ZONE; UTC by default). */
export function toDatetimeLocal(d: Date): string {
  const p = dateParts(d, 'UTC')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}${p.second ? `:${pad(p.second)}` : ''}`
}

/** `YYYY-MM-DD` of today (UTC). */
export function todayString(now = new Date()): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return todayString(d)
}

/** Is `obj` a model instance? */
export function isModelInstance(obj: unknown): obj is BaseModel {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as any).constructor?._meta === 'object' &&
    (obj as any)._state !== undefined
  )
}

/** Is `v` a storage FieldFile (duck-typed so @ghuri/storage stays optional)? */
export function isFieldFileLike(v: unknown): v is { name: string | null; url: string; isEmpty: boolean } {
  return typeof v === 'object' && v !== null && 'isEmpty' in v && 'name' in v && 'field' in v
}

/** Shell-like split for search terms: quoted phrases stay together (Django's smart_split). */
export function smartSplit(text: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of text.matchAll(re)) {
    const v = m[1] ?? m[2] ?? m[3]
    if (v) out.push(v)
  }
  return out
}

/** Build a query string from a URLSearchParams after applying `set` / `remove` (Django's get_query_string). */
export function queryString(
  base: URLSearchParams,
  set: Record<string, string | number | null | undefined> = {},
  remove: string[] = [],
): string {
  const p = new URLSearchParams(base)
  for (const r of remove) {
    for (const k of [...p.keys()]) if (k === r || k.startsWith(r)) p.delete(k)
  }
  for (const [k, v] of Object.entries(set)) {
    if (v === null || v === undefined) p.delete(k)
    else p.set(k, String(v))
  }
  const s = p.toString()
  return `?${s}`
}

/** Escape for use inside RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}
