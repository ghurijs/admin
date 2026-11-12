// The admin's LogEntry model (Django's django_admin_log table).
import { ContentType, getUserModel } from '@ghuri/auth'
import {
  type BaseModel,
  CASCADE,
  CharField,
  DateTimeField,
  ForeignKey,
  Manager,
  Model,
  type ModelClass,
  PositiveSmallIntegerField,
  SET_NULL,
  TextField,
} from '@ghuri/orm'
import { capfirst, textList, truncate } from './utils'

export const ADDITION = 1
export const CHANGE = 2
export const DELETION = 3

export const ACTION_FLAG_CHOICES: Array<[number, string]> = [
  [ADDITION, 'Addition'],
  [CHANGE, 'Change'],
  [DELETION, 'Deletion'],
]

/** One entry of a JSON change message (Django's format). */
export type ChangeMessageEntry =
  | { added: { name?: string; object?: string } }
  | { changed: { fields: string[]; name?: string; object?: string } }
  | { deleted: { name: string; object: string } }

export type ChangeMessage = string | ChangeMessageEntry[]

/** Default of `LogEntry.actionTime` (Django's `timezone.now`). */
export function now(): Date {
  return new Date()
}

const userModel = () => getUserModel() as unknown as ModelClass

export interface LogActionOptions {
  userId: unknown
  contentTypeId: unknown
  objectId: unknown
  objectRepr: string
  actionFlag: number
  changeMessage?: ChangeMessage
}

export class LogEntryManager extends Manager<LogEntry> {
  /** Record an action (Django's `log_action`). */
  async logAction(opts: LogActionOptions): Promise<LogEntry> {
    const msg = opts.changeMessage ?? ''
    return (await this.create({
      userId: opts.userId,
      contentTypeId: opts.contentTypeId,
      objectId: opts.objectId === null || opts.objectId === undefined ? null : String(opts.objectId),
      objectRepr: truncate(opts.objectRepr, 200),
      actionFlag: opts.actionFlag,
      changeMessage: typeof msg === 'string' ? msg : JSON.stringify(msg),
    } as any)) as LogEntry
  }

  /** Log the same action for several objects of one model (Django's `log_actions`). */
  async logActions(
    userId: unknown,
    objects: BaseModel[],
    actionFlag: number,
    changeMessage: ChangeMessage = '',
  ): Promise<LogEntry[]> {
    if (!objects.length) return []
    const ct = await ContentType.objects.getForModel(objects[0].constructor as any)
    const out: LogEntry[] = []
    for (const obj of objects) {
      out.push(
        await this.logAction({
          userId,
          contentTypeId: ct.pk,
          objectId: obj.pk,
          objectRepr: String(obj),
          actionFlag,
          changeMessage,
        }),
      )
    }
    return out
  }
}

/** Admin history: one row per add / change / delete done through the admin (table `django_admin_log`). */
export class LogEntry extends Model({
  actionTime: new DateTimeField({ default: now, editable: false, verboseName: 'action time' }),
  user: new ForeignKey(userModel, { onDelete: CASCADE, verboseName: 'user' }),
  contentType: new ForeignKey(() => ContentType as unknown as ModelClass, {
    onDelete: SET_NULL,
    null: true,
    blank: true,
    verboseName: 'content type',
  }),
  objectId: new TextField({ null: true, blank: true, verboseName: 'object id' }),
  objectRepr: new CharField({ maxLength: 200, verboseName: 'object repr' }),
  actionFlag: new PositiveSmallIntegerField({ choices: ACTION_FLAG_CHOICES, verboseName: 'action flag' }),
  changeMessage: new TextField({ blank: true, verboseName: 'change message' }),
}) {
  static Meta = {
    dbTable: 'django_admin_log',
    verboseName: 'log entry',
    verboseNamePlural: 'log entries',
    ordering: ['-actionTime'],
  }
  static objects = new LogEntryManager()

  isAddition(): boolean {
    return this.actionFlag === ADDITION
  }
  isChange(): boolean {
    return this.actionFlag === CHANGE
  }
  isDeletion(): boolean {
    return this.actionFlag === DELETION
  }

  /** Human-readable change message (Django's `get_change_message`). */
  getChangeMessage(): string {
    const raw = this.changeMessage ?? ''
    if (!raw.startsWith('[')) return raw
    let parsed: ChangeMessageEntry[]
    try {
      parsed = JSON.parse(raw)
    } catch {
      return raw
    }
    const messages: string[] = []
    for (const sub of parsed as any[]) {
      if (sub.added) {
        if (sub.added.name) messages.push(`added ${sub.added.name} “${sub.added.object}”.`)
        else messages.push('added.')
      } else if (sub.changed) {
        const fields = textList(sub.changed.fields ?? [], 'and')
        if (sub.changed.name)
          messages.push(`changed ${fields} for ${sub.changed.name} “${sub.changed.object}”.`)
        else messages.push(`changed ${fields}.`)
      } else if (sub.deleted) {
        messages.push(`deleted ${sub.deleted.name} “${sub.deleted.object}”.`)
      }
    }
    const text = messages.map(capfirst).join(' ')
    return text || 'No fields changed.'
  }

  override toString(): string {
    if (this.isAddition()) return `Added “${this.objectRepr}”.`
    if (this.isChange()) return `Changed “${this.objectRepr}” — ${this.getChangeMessage()}`
    if (this.isDeletion()) return `Deleted “${this.objectRepr}.”`
    return 'LogEntry Object'
  }
}
