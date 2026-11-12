// A tiny flash-message store (Django's contrib.messages): session-backed when SessionMiddleware is
// installed, a cookie otherwise. Messages are plain text and always rendered escaped.
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

export const DEBUG = 10
export const INFO = 20
export const SUCCESS = 25
export const WARNING = 30
export const ERROR = 40

export type MessageLevel = number | 'debug' | 'info' | 'success' | 'warning' | 'error'

export interface Message {
  level: number
  message: string
  tags: string
}

const LEVEL_TAGS: Record<number, string> = {
  [DEBUG]: 'debug',
  [INFO]: 'info',
  [SUCCESS]: 'success',
  [WARNING]: 'warning',
  [ERROR]: 'error',
}
const NAMED: Record<string, number> = {
  debug: DEBUG,
  info: INFO,
  success: SUCCESS,
  warning: WARNING,
  error: ERROR,
}

const SESSION_KEY = '_messages'
const COOKIE_NAME = 'messages'
const PENDING = Symbol.for('ghuri.admin.pendingMessages')

function levelOf(level: MessageLevel): number {
  return typeof level === 'number' ? level : (NAMED[level] ?? INFO)
}

function session(c: Context): any {
  try {
    return c.get('session' as never) as any
  } catch {
    return undefined
  }
}

function encodeCookie(list: Array<[number, string]>): string {
  const json = JSON.stringify(list)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decodeCookie(raw: string | undefined): Array<[number, string]> {
  if (!raw) return []
  try {
    const bin = atob(raw)
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    const list = JSON.parse(new TextDecoder().decode(bytes))
    if (!Array.isArray(list)) return []
    return list
      .filter((m) => Array.isArray(m) && typeof m[0] === 'number' && typeof m[1] === 'string')
      .slice(0, 20)
  } catch {
    return []
  }
}

/** Queue a message for the next page the user sees. */
export async function addMessage(c: Context, level: MessageLevel, message: string): Promise<void> {
  const entry: [number, string] = [levelOf(level), String(message)]
  const s = session(c)
  if (s && typeof s.get === 'function') {
    const list = ((await s.get(SESSION_KEY, [])) as Array<[number, string]>) ?? []
    await s.set(SESSION_KEY, [...list, entry])
    return
  }
  if (!(c as any)[PENDING]) (c as any)[PENDING] = decodeCookie(getCookie(c, COOKIE_NAME))
  const pending: Array<[number, string]> = (c as any)[PENDING]
  pending.push(entry)
  setCookie(c, COOKIE_NAME, encodeCookie(pending), { path: '/', httpOnly: true, sameSite: 'Lax' })
}

/** Read and clear the queued messages. */
export async function consumeMessages(c: Context): Promise<Message[]> {
  let list: Array<[number, string]> = []
  const s = session(c)
  if (s && typeof s.get === 'function') {
    list = ((await s.get(SESSION_KEY, [])) as Array<[number, string]>) ?? []
    if (list.length) await s.delete(SESSION_KEY)
  } else {
    list = (c as any)[PENDING] ?? decodeCookie(getCookie(c, COOKIE_NAME))
    if (list.length) deleteCookie(c, COOKIE_NAME, { path: '/' })
    ;(c as any)[PENDING] = []
  }
  return list.map(([level, message]) => ({ level, message, tags: LEVEL_TAGS[level] ?? 'info' }))
}
