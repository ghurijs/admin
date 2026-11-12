// HTML widgets for admin form fields (Django's forms.widgets + admin.widgets).
import type { Choice, FormField, ModelForm } from '../forms'
import { isFieldFileLike } from '../utils'

const INPUT_TYPES: Record<string, string> = {
  text: 'text',
  email: 'email',
  url: 'url',
  number: 'number',
  password: 'password',
  date: 'date',
  time: 'time',
  datetime: 'datetime-local',
  hidden: 'hidden',
}

const INPUT_CLASSES: Record<string, string> = {
  text: 'vTextField',
  email: 'vTextField',
  url: 'vURLField',
  number: 'vIntegerField',
  password: 'vTextField',
  date: 'vDateField',
  time: 'vTimeField',
  datetime: 'vDateTimeField',
}

export function fieldId(form: ModelForm, name: string): string {
  return `id_${form.addPrefix(name)}`
}

function isSelected(value: unknown, choice: Choice): boolean {
  if (Array.isArray(value)) return value.map(String).includes(choice.value)
  return String(value ?? '') === choice.value
}

function Options({
  field,
  value,
  includeBlank,
}: {
  field: FormField
  value: unknown
  includeBlank: boolean
}) {
  return (
    <>
      {includeBlank ? (
        <option value="" selected={value === '' || value === null || value === undefined}>
          {field.emptyLabel}
        </option>
      ) : null}
      {(field.choices ?? []).map((c) => (
        <option value={c.value} selected={isSelected(value, c)}>
          {c.label}
        </option>
      ))}
    </>
  )
}

function includeBlank(field: FormField): boolean {
  if (field.multiple) return false
  const init = field.initial
  return !(field.required && init !== undefined && init !== null && init !== '')
}

const MULTI_HELP = 'Hold down “Control”, or “Command” on a Mac, to select more than one.'

/** Render one form field's input(s). */
export function Widget({
  form,
  field,
  extraAttrs,
}: {
  form: ModelForm
  field: FormField
  extraAttrs?: Record<string, unknown>
}) {
  const name = form.addPrefix(field.name)
  const id = fieldId(form, field.name)
  const value = form.valueFor(field.name)
  const attrs: Record<string, unknown> = { ...field.attrs, ...extraAttrs }
  const disabled = field.disabled || undefined
  const required = (field.required && !field.isCheckbox && !disabled) || undefined
  switch (field.widget) {
    case 'textarea':
    case 'json':
      return (
        <textarea
          name={name}
          id={id}
          cols={40}
          rows={field.widget === 'json' ? 6 : 10}
          class={field.widget === 'json' ? 'vLargeTextField vJSONField' : 'vLargeTextField'}
          required={required}
          disabled={disabled}
          {...attrs}
        >
          {String(value ?? '')}
        </textarea>
      )
    case 'checkbox':
      return <input type="checkbox" name={name} id={id} checked={!!value} disabled={disabled} {...attrs} />
    case 'select':
      return (
        <select name={name} id={id} required={required} disabled={disabled} {...attrs}>
          <Options field={field} value={value} includeBlank={includeBlank(field)} />
        </select>
      )
    case 'radio': {
      const inline = field.meta.layout === 'horizontal'
      const choices = [
        ...(includeBlank(field) && !field.required ? [{ value: '', label: 'None' }] : []),
        ...(field.choices ?? []),
      ]
      return (
        <div class={`radiolist${inline ? ' inline' : ''}`} id={id}>
          {choices.map((c, i) => (
            <div>
              <label for={`${id}_${i}`}>
                <input
                  type="radio"
                  name={name}
                  value={c.value}
                  id={`${id}_${i}`}
                  checked={String(value ?? '') === c.value}
                  disabled={disabled}
                  required={required}
                />{' '}
                {c.label}
              </label>
            </div>
          ))}
        </div>
      )
    }
    case 'checkbox-multiple':
      return (
        <div id={id}>
          {(field.choices ?? []).map((c, i) => (
            <div>
              <label for={`${id}_${i}`}>
                <input
                  type="checkbox"
                  name={name}
                  value={c.value}
                  id={`${id}_${i}`}
                  checked={isSelected(value, c)}
                  disabled={disabled}
                />{' '}
                {c.label}
              </label>
            </div>
          ))}
        </div>
      )
    case 'select-multiple':
      return (
        <>
          <select
            name={name}
            id={id}
            multiple
            size={Math.min(10, Math.max(4, field.choices?.length ?? 4))}
            class="vSelectMultipleField"
            disabled={disabled}
            {...attrs}
          >
            <Options field={field} value={value} includeBlank={false} />
          </select>
          {disabled ? null : <div class="help">{MULTI_HELP}</div>}
        </>
      )
    case 'filter-horizontal':
    case 'filter-vertical':
      return (
        <div class={`selector${field.widget === 'filter-vertical' ? ' stacked' : ''}`}>
          <input
            type="search"
            class="selector-filter-input hidden"
            data-target={id}
            placeholder={`Filter ${field.label.toLowerCase()}`}
            aria-label={`Filter ${field.label.toLowerCase()}`}
            form="ghuri-no-submit"
          />
          <select
            name={name}
            id={id}
            multiple
            size={12}
            class="filtered vSelectMultipleField"
            disabled={disabled}
            {...attrs}
          >
            <Options field={field} value={value} includeBlank={false} />
          </select>
          {disabled ? null : <div class="help">{MULTI_HELP}</div>}
        </div>
      )
    case 'raw-id':
    case 'raw-id-multiple': {
      const lookupUrl = field.meta.lookupUrl as string | undefined
      const current = field.meta.currentLabels as Array<{ label: string; url?: string | null }> | undefined
      return (
        <div class="related-widget-wrapper">
          <input
            type="text"
            name={name}
            id={id}
            value={Array.isArray(value) ? value.join(',') : String(value ?? '')}
            class={field.widget === 'raw-id' ? 'vForeignKeyRawIdAdminField' : 'vManyToManyRawIdAdminField'}
            disabled={disabled}
            required={required}
            {...attrs}
          />
          {lookupUrl ? (
            <a href={lookupUrl} class="related-lookup" target="_blank" rel="noopener" title="Look up">
              Look up
            </a>
          ) : null}
          {current?.length ? (
            <strong>
              {current.map((c, i) => (
                <>
                  {i > 0 ? ', ' : ''}
                  {c.url ? <a href={c.url}>{c.label}</a> : c.label}
                </>
              ))}
            </strong>
          ) : null}
        </div>
      )
    }
    case 'autocomplete':
    case 'autocomplete-multiple': {
      const multiple = field.widget === 'autocomplete-multiple'
      const url = field.meta.autocompleteUrl as string
      return (
        <div class="autocomplete-widget">
          <input
            type="search"
            name="term"
            class="hidden"
            form="ghuri-no-submit"
            placeholder="Search…"
            aria-label={`Search ${field.label.toLowerCase()}`}
            autocomplete="off"
            hx-get={url}
            hx-trigger="input changed delay:300ms, search"
            hx-target="next .autocomplete-results"
            hx-swap="innerHTML"
            disabled={disabled}
          />
          <select
            name={name}
            id={id}
            multiple={multiple || undefined}
            disabled={disabled}
            required={required}
            {...attrs}
          >
            <Options field={field} value={value} includeBlank={!multiple && !field.required} />
          </select>
          <div class="autocomplete-results" aria-live="polite"></div>
        </div>
      )
    }
    case 'file': {
      const file = value as unknown
      const hasFile = isFieldFileLike(file) ? !file.isEmpty : false
      let url: string | null = null
      if (hasFile) {
        try {
          url = (file as any).url
        } catch {
          url = null
        }
      }
      return (
        <p class="file-upload">
          {hasFile ? (
            <>
              Currently: {url ? <a href={url}>{String((file as any).name)}</a> : String((file as any).name)}
              {!field.required && !disabled ? (
                <span class="clearable-file-input">
                  {' '}
                  <input type="checkbox" name={`${name}-clear`} id={`${name}-clear_id`} />{' '}
                  <label for={`${name}-clear_id`}>Clear</label>
                </span>
              ) : null}
              <br />
              Change:{' '}
            </>
          ) : null}
          <input
            type="file"
            name={name}
            id={id}
            disabled={disabled}
            accept={(field.attrs.accept as string) || undefined}
          />
        </p>
      )
    }
    default: {
      const type = INPUT_TYPES[field.widget] ?? 'text'
      const cls = type === 'hidden' ? undefined : (INPUT_CLASSES[field.widget] ?? 'vTextField')
      return (
        <input
          type={type}
          name={name}
          id={id}
          value={field.widget === 'password' ? '' : String(value ?? '')}
          class={cls}
          required={required}
          disabled={disabled}
          {...attrs}
        />
      )
    }
  }
}

/** Read-only value display. */
export function Readonly({ value }: { value: unknown }) {
  return <div class="readonly">{value as any}</div>
}

/** Error list (`<ul class="errorlist">`). */
export function ErrorList({ errors, nonfield }: { errors?: string[]; nonfield?: boolean }) {
  if (!errors?.length) return null
  return (
    <ul class={`errorlist${nonfield ? ' nonfield' : ''}`}>
      {errors.map((e) => (
        <li>{e}</li>
      ))}
    </ul>
  )
}
