// Add / change form page (Django's admin/change_form.html, fieldset.html, edit_inline/*).
import type { Child } from 'hono/jsx'
import type { FormField, ModelForm } from '../forms'
import { type AdminContext, type Crumb, CsrfInput, Page } from './base'
import { ErrorList, fieldId, Widget } from './widgets'

export type AdminFieldView =
  | {
      kind: 'field'
      name: string
      field: FormField
      form: ModelForm
      label: string
      required: boolean
      helpText?: string
      errors: string[]
      extraAttrs?: Record<string, unknown>
    }
  | { kind: 'readonly'; name: string; label: string; content: Child; helpText?: string }

export interface FieldLineView {
  fields: AdminFieldView[]
}

export interface FieldsetView {
  name: string | null
  classes: string[]
  description?: string
  lines: FieldLineView[]
}

export interface InlineFormView {
  form: ModelForm
  index: string
  originalLabel: string | null
  changeUrl: string | null
  fieldsets: FieldsetView[]
  /** Tabular: flat list of fields in column order. */
  cells: AdminFieldView[]
  pkName: string
  pkValue: string | null
  canDelete: boolean
  deleteChecked: boolean
  isEmptyForm: boolean
}

export interface InlineView {
  prefix: string
  kind: 'tabular' | 'stacked'
  verboseName: string
  verboseNamePlural: string
  columns: Array<{ label: string; required: boolean; helpText?: string; hidden?: boolean }>
  forms: InlineFormView[]
  emptyForm: InlineFormView | null
  management: Record<string, string>
  nonFormErrors: string[]
  canDelete: boolean
  canAdd: boolean
  classes: string[]
  description?: string
}

export interface SubmitRowView {
  showSave: boolean
  showSaveAsNew: boolean
  showSaveAndAddAnother: boolean
  showSaveAndContinue: boolean
  deleteUrl: string | null
  closeUrl: string | null
}

export interface ChangeFormPageProps {
  ctx: AdminContext
  title: string
  subtitle?: string | null
  breadcrumbs: Crumb[]
  bodyClass: string
  currentModel: unknown
  add: boolean
  formAction: string
  multipart: boolean
  errorCount: number
  nonFieldErrors: string[]
  fieldsets: FieldsetView[]
  inlines: InlineView[]
  hiddenFields: Child
  submitRow: SubmitRowView
  saveOnTop: boolean
  historyUrl: string | null
  viewOnSiteUrl: string | null
  objectToolsExtra?: Child
  readonlyView: boolean
}

function Label({ f }: { f: Extract<AdminFieldView, { kind: 'field' }> }) {
  const isCheckbox = f.field.widget === 'checkbox'
  const cls = [f.required ? 'required' : '', isCheckbox ? 'vCheckboxLabel' : ''].filter(Boolean).join(' ')
  const usesId = !['radio', 'checkbox-multiple'].includes(f.field.widget)
  return (
    <label for={usesId ? fieldId(f.form, f.field.name) : undefined} class={cls || undefined}>
      {f.label}
      {isCheckbox ? '' : ':'}
    </label>
  )
}

function FieldBox({ f, single }: { f: AdminFieldView; single: boolean }) {
  if (f.kind === 'readonly') {
    return (
      <div>
        <div class={`flex-container${single ? '' : ` fieldBox field-${f.name}`}`}>
          <label>{f.label}:</label>
          <div class="readonly">{f.content}</div>
        </div>
        {f.helpText ? (
          <div class="help">
            <div>{f.helpText}</div>
          </div>
        ) : null}
      </div>
    )
  }
  const isCheckbox = f.field.widget === 'checkbox'
  const hidden = f.field.isHidden
  const boxClass = single
    ? `flex-container${isCheckbox ? ' checkbox-row' : ''}`
    : `flex-container fieldBox field-${f.name}${f.errors.length ? ' errors' : ''}${hidden ? ' hidden' : ''}`
  const id = fieldId(f.form, f.field.name)
  return (
    <div>
      {single ? null : <ErrorList errors={f.errors} />}
      <div class={boxClass}>
        {isCheckbox ? (
          <>
            <Widget form={f.form} field={f.field} extraAttrs={f.extraAttrs} />
            <Label f={f} />
          </>
        ) : (
          <>
            {hidden ? null : <Label f={f} />}
            <Widget form={f.form} field={f.field} extraAttrs={f.extraAttrs} />
          </>
        )}
      </div>
      {f.helpText ? (
        <div class="help" id={`${id}_helptext`}>
          <div>{f.helpText}</div>
        </div>
      ) : null}
    </div>
  )
}

function FieldLine({ line }: { line: FieldLineView }) {
  const single = line.fields.length === 1
  const errs = single && line.fields[0].kind === 'field' ? line.fields[0].errors : []
  const visible = line.fields.some((f) => f.kind === 'readonly' || !f.field.isHidden)
  const cls = [
    'form-row',
    single && errs.length ? 'errors' : '',
    visible ? '' : 'hidden',
    ...line.fields.map((f) => `field-${f.name}`),
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div class={cls}>
      {single ? <ErrorList errors={errs} /> : null}
      {single ? (
        <FieldBox f={line.fields[0]} single />
      ) : (
        <div class="flex-container form-multiline">
          {line.fields.map((f) => (
            <FieldBox f={f} single={false} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Fieldset({
  fs,
  headingLevel = 2,
  id,
}: {
  fs: FieldsetView
  headingLevel?: 2 | 3 | 4
  id?: string
}) {
  const H = `h${headingLevel}` as any
  const collapse = fs.classes.includes('collapse')
  const cls = ['module', 'aligned', ...fs.classes.filter((c) => c !== 'collapse')].join(' ')
  const body = (
    <>
      {fs.description ? <div class="description">{fs.description}</div> : null}
      {fs.lines.map((line) => (
        <FieldLine line={line} />
      ))}
    </>
  )
  if (collapse) {
    const hasErrors = fs.lines.some((l) => l.fields.some((f) => f.kind === 'field' && f.errors.length))
    return (
      <fieldset class={cls} id={id}>
        <details open={hasErrors || undefined}>
          <summary class="fieldset-heading">{fs.name ?? 'Show'}</summary>
          {body}
        </details>
      </fieldset>
    )
  }
  return (
    <fieldset class={cls} id={id}>
      {fs.name ? <H class="fieldset-heading">{fs.name}</H> : null}
      {body}
    </fieldset>
  )
}

function ManagementForm({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([k, v]) => (
        <input type="hidden" name={k} value={v} id={`id_${k}`} />
      ))}
    </>
  )
}

function DeleteCell({ inline, f }: { inline: InlineView; f: InlineFormView }) {
  if (!inline.canDelete) return null
  if (f.isEmptyForm || !f.pkValue) {
    return (
      <td class="delete">
        <a href="#" class="inline-deletelink hidden" title="Remove">
          ✖
        </a>
      </td>
    )
  }
  if (!f.canDelete) return <td class="delete"></td>
  const name = `${f.form.prefix}-DELETE`
  return (
    <td class="delete">
      <input type="checkbox" name={name} id={`id_${name}`} checked={f.deleteChecked} aria-label="Delete" />
    </td>
  )
}

function TabularRow({ inline, f }: { inline: InlineView; f: InlineFormView }) {
  const nonField = f.form.nonFieldErrors()
  const hasErrors = f.cells.some((c) => c.kind === 'field' && c.errors.length)
  return (
    <>
      {nonField.length ? (
        <tr class="row-form-errors">
          <td colspan={inline.columns.length + 2}>
            <ErrorList errors={nonField} nonfield />
          </td>
        </tr>
      ) : null}
      <tr
        class={`form-row${f.pkValue ? ' has_original' : ''}${f.isEmptyForm ? ' empty-form' : ''}${hasErrors ? ' errors' : ''}`}
        id={`${inline.prefix}-${f.index}`}
      >
        <td class="original">
          {f.originalLabel ? (
            <p>
              {f.originalLabel}
              {f.changeUrl ? (
                <>
                  {' '}
                  <a href={f.changeUrl} class="inlinechangelink">
                    Change
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          {f.pkValue !== null ? (
            <input
              type="hidden"
              name={`${f.form.prefix}-${f.pkName}`}
              value={f.pkValue}
              id={`id_${f.form.prefix}-${f.pkName}`}
            />
          ) : null}
        </td>
        {f.cells.map((cell) =>
          cell.kind === 'readonly' ? (
            <td class={`field-${cell.name}`}>
              <p>{cell.content}</p>
            </td>
          ) : (
            <td class={`field-${cell.name}${cell.field.isHidden ? ' hidden' : ''}`}>
              <ErrorList errors={cell.errors} />
              <Widget form={cell.form} field={cell.field} extraAttrs={cell.extraAttrs} />
            </td>
          ),
        )}
        <DeleteCell inline={inline} f={f} />
      </tr>
    </>
  )
}

function TabularInline({ inline }: { inline: InlineView }) {
  return (
    <div
      class={`js-inline-admin-formset inline-group${inline.classes.length ? ` ${inline.classes.join(' ')}` : ''}`}
      id={`${inline.prefix}-group`}
      data-inline-type="tabular"
      data-prefix={inline.prefix}
    >
      <div class="tabular inline-related last-related">
        <ManagementForm values={inline.management} />
        <fieldset class="module">
          <h2 id={`${inline.prefix}-heading`} class="inline-heading">
            {inline.verboseNamePlural}
          </h2>
          {inline.description ? <div class="description">{inline.description}</div> : null}
          <ErrorList errors={inline.nonFormErrors} nonfield />
          <table>
            <thead>
              <tr>
                <th class="original"></th>
                {inline.columns.map((col) => (
                  <th
                    class={`column-${col.label}${col.required ? ' required' : ''}${col.hidden ? ' hidden' : ''}`}
                  >
                    {col.label}
                    {col.helpText ? (
                      <span class="help help-tooltip" title={col.helpText}>
                        {' '}
                        ⓘ
                      </span>
                    ) : null}
                  </th>
                ))}
                {inline.canDelete ? <th>Delete?</th> : null}
              </tr>
            </thead>
            <tbody data-inline-rows>
              {inline.forms.map((f) => (
                <TabularRow inline={inline} f={f} />
              ))}
            </tbody>
          </table>
          {inline.emptyForm && inline.canAdd ? (
            <>
              <template class="empty-form-template">
                <TabularRow inline={inline} f={inline.emptyForm} />
              </template>
              <div class="add-row hidden">
                <a href="#" role="button">
                  + Add another {inline.verboseName}
                </a>
              </div>
            </>
          ) : null}
        </fieldset>
      </div>
    </div>
  )
}

function StackedForm({ inline, f }: { inline: InlineView; f: InlineFormView }) {
  return (
    <div
      class={`inline-related${f.pkValue ? ' has_original' : ''}${f.isEmptyForm ? ' empty-form last-related' : ''}`}
      id={`${inline.prefix}-${f.index}`}
    >
      <h3>
        <b>{inline.verboseName}:</b>{' '}
        <span class="inline_label">
          {f.originalLabel ?? `#${f.isEmptyForm ? '' : Number(f.index) + 1}`}
          {f.changeUrl ? (
            <>
              {' '}
              <a href={f.changeUrl} class="inlinechangelink">
                Change
              </a>
            </>
          ) : null}
        </span>
        {inline.canDelete && f.pkValue && f.canDelete ? (
          <span class="delete">
            <input
              type="checkbox"
              name={`${f.form.prefix}-DELETE`}
              id={`id_${f.form.prefix}-DELETE`}
              checked={f.deleteChecked}
            />{' '}
            <label for={`id_${f.form.prefix}-DELETE`}>Delete</label>
          </span>
        ) : null}
        {f.isEmptyForm || (!f.pkValue && inline.canDelete) ? (
          <a href="#" class="inline-deletelink hidden" title="Remove">
            ✖
          </a>
        ) : null}
      </h3>
      <ErrorList errors={f.form.nonFieldErrors()} nonfield />
      {f.fieldsets.map((fs) => (
        <Fieldset fs={fs} headingLevel={4} />
      ))}
      {f.pkValue !== null ? (
        <input
          type="hidden"
          name={`${f.form.prefix}-${f.pkName}`}
          value={f.pkValue}
          id={`id_${f.form.prefix}-${f.pkName}`}
        />
      ) : null}
    </div>
  )
}

function StackedInline({ inline }: { inline: InlineView }) {
  return (
    <div
      class={`js-inline-admin-formset inline-group${inline.classes.length ? ` ${inline.classes.join(' ')}` : ''}`}
      id={`${inline.prefix}-group`}
      data-inline-type="stacked"
      data-prefix={inline.prefix}
    >
      <fieldset class="module">
        <h2 id={`${inline.prefix}-heading`} class="inline-heading">
          {inline.verboseNamePlural}
        </h2>
        <ManagementForm values={inline.management} />
        {inline.description ? <div class="description">{inline.description}</div> : null}
        <ErrorList errors={inline.nonFormErrors} nonfield />
        <div data-inline-rows>
          {inline.forms.map((f) => (
            <StackedForm inline={inline} f={f} />
          ))}
        </div>
        {inline.emptyForm && inline.canAdd ? (
          <>
            <template class="empty-form-template">
              <StackedForm inline={inline} f={inline.emptyForm} />
            </template>
            <div class="add-row hidden">
              <a href="#" role="button">
                + Add another {inline.verboseName}
              </a>
            </div>
          </>
        ) : null}
      </fieldset>
    </div>
  )
}

export function SubmitRow({ row }: { row: SubmitRowView }) {
  return (
    <div class="submit-row">
      {row.showSave ? <input type="submit" value="Save" class="default" name="_save" /> : null}
      {row.showSaveAsNew ? <input type="submit" value="Save as new" name="_saveasnew" /> : null}
      {row.showSaveAndAddAnother ? (
        <input type="submit" value="Save and add another" name="_addanother" />
      ) : null}
      {row.showSaveAndContinue ? (
        <input type="submit" value="Save and continue editing" name="_continue" />
      ) : null}
      {row.closeUrl ? (
        <a href={row.closeUrl} class="closelink">
          Close
        </a>
      ) : null}
      {row.deleteUrl ? (
        <a href={row.deleteUrl} class="deletelink">
          Delete
        </a>
      ) : null}
    </div>
  )
}

export function ChangeFormPage(props: ChangeFormPageProps) {
  const { ctx } = props
  const hasTools = props.historyUrl || props.viewOnSiteUrl || props.objectToolsExtra
  return (
    <Page
      ctx={ctx}
      title={props.title}
      subtitle={props.subtitle}
      bodyClass={props.bodyClass}
      breadcrumbs={props.breadcrumbs}
      navSidebar
      currentModel={props.currentModel}
    >
      <div id="content-main">
        {hasTools ? (
          <ul class="object-tools">
            {props.objectToolsExtra}
            {props.historyUrl ? (
              <li>
                <a href={props.historyUrl} class="historylink">
                  History
                </a>
              </li>
            ) : null}
            {props.viewOnSiteUrl ? (
              <li>
                <a href={props.viewOnSiteUrl} class="viewsitelink">
                  View on site
                </a>
              </li>
            ) : null}
          </ul>
        ) : null}
        <form
          enctype={props.multipart ? 'multipart/form-data' : undefined}
          action={props.formAction}
          method="post"
          id="post_form"
          novalidate
        >
          <CsrfInput token={ctx.csrfToken} />
          <div>
            {props.hiddenFields}
            {props.saveOnTop && !props.readonlyView ? <SubmitRow row={props.submitRow} /> : null}
            {props.errorCount ? (
              <p class="errornote">
                {props.errorCount === 1
                  ? 'Please correct the error below.'
                  : 'Please correct the errors below.'}
              </p>
            ) : null}
            <ErrorList errors={props.nonFieldErrors} nonfield />
            {props.fieldsets.map((fs) => (
              <Fieldset fs={fs} />
            ))}
            {props.inlines.map((inline) =>
              inline.kind === 'tabular' ? (
                <TabularInline inline={inline} />
              ) : (
                <StackedInline inline={inline} />
              ),
            )}
            <SubmitRow row={props.submitRow} />
          </div>
        </form>
      </div>
    </Page>
  )
}
