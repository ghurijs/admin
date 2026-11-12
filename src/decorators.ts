// `display()` and `action()` (Django's @admin.display / @admin.action).

export interface DisplayOptions {
  /** Column header / label (Django's `short_description`). */
  description?: string
  /** Field (or `-field`) to sort by when the column header is clicked (Django's `admin_order_field`). */
  ordering?: string
  /** Render the value as a yes/no/unknown icon. */
  boolean?: boolean
  /** Text shown for empty values (Django's `empty_value_display`). */
  emptyValue?: string
}

export interface ActionOptions {
  /** Label in the action dropdown (Django's `short_description`). */
  description?: string
  /** Required permissions: `'add' | 'change' | 'delete' | 'view'` or a custom name `x` checked by `hasXPermission(c)`. */
  permissions?: string[]
}

export const DISPLAY = Symbol.for('ghuri.admin.display')
export const ACTION = Symbol.for('ghuri.admin.action')

/** Display options attached to a function or method. */
export function getDisplayOptions(fn: unknown): DisplayOptions | undefined {
  if (typeof fn !== 'function') return undefined
  return (fn as any)[DISPLAY] as DisplayOptions | undefined
}

/** Action options attached to a function or method. */
export function getActionOptions(fn: unknown): ActionOptions | undefined {
  if (typeof fn !== 'function') return undefined
  return (fn as any)[ACTION] as ActionOptions | undefined
}

function attach<F extends Function>(fn: F, key: symbol, opts: object): F {
  ;(fn as any)[key] = { ...(fn as any)[key], ...opts }
  return fn
}

type AnyFn = (...args: any[]) => any

/**
 * A decorator usable as a TC39 method decorator (`@display({...}) method(obj) {}`), a legacy
 * (`experimentalDecorators`) method decorator, or a plain wrapper (`display({...})(fn)`).
 */
export interface FunctionDecorator {
  <F extends AnyFn>(fn: F, context?: unknown): F
  (target: object, key: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor
}

function makeDecorator(key: symbol, opts: object): FunctionDecorator {
  return ((fnOrTarget: any, _keyOrContext?: unknown, descriptor?: PropertyDescriptor) => {
    if (descriptor && typeof descriptor.value === 'function') {
      attach(descriptor.value, key, opts)
      return descriptor
    }
    if (typeof fnOrTarget !== 'function')
      throw new TypeError('display()/action() decorate functions or methods.')
    return attach(fnOrTarget, key, opts)
  }) as FunctionDecorator
}

/**
 * Django's `@admin.display`: column header, sort field and boolean rendering for `listDisplay` /
 * `readonlyFields` callables.
 *
 * ```ts
 * class PostAdmin extends ModelAdmin<Post> {
 *   listDisplay = ['title', 'isRecent']
 *   @display({ description: 'Recent?', boolean: true, ordering: 'createdAt' })
 *   isRecent(obj: Post) { return obj.createdAt > lastWeek }
 * }
 * // without decorators:
 * const upper = display({ description: 'Title' }, (obj: Post) => obj.title.toUpperCase())
 * ```
 */
export function display(opts: DisplayOptions): FunctionDecorator
export function display<F extends AnyFn>(opts: DisplayOptions, fn: F): F
export function display(opts: DisplayOptions, fn?: AnyFn): any {
  if (fn) return attach(fn, DISPLAY, opts)
  return makeDecorator(DISPLAY, opts)
}

/**
 * Django's `@admin.action`: label and required permissions of an admin action.
 *
 * ```ts
 * const makePublished = action({ description: 'Mark selected posts as published', permissions: ['change'] },
 *   async (modelAdmin, c, queryset) => { await queryset.update({ published: true }) })
 * ```
 */
export function action(opts: ActionOptions): FunctionDecorator
export function action<F extends AnyFn>(opts: ActionOptions, fn: F): F
export function action(opts: ActionOptions, fn?: AnyFn): any {
  if (fn) return attach(fn, ACTION, opts)
  return makeDecorator(ACTION, opts)
}
