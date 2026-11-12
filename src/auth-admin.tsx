// UserAdmin and GroupAdmin (Django's django.contrib.auth.admin), registered on the default site.
import {
  Group,
  getUserModel,
  identifyHasher,
  isPasswordUsable,
  Permission,
  passwordValidatorsHelpTexts,
  User,
  updateSessionAuthHash,
  validatePassword,
} from '@ghuri/auth'
import { getUser, kwargs, PermissionDenied, path, type UrlEntry, ValidationError } from '@ghuri/core'
import type { Field, QuerySet } from '@ghuri/orm'
import type { Context } from 'hono'
import { display } from './decorators'
import { type FormDataLike, FormField, type ModelForm } from './forms'
import { SUCCESS } from './messages'
import { type Fieldset, ModelAdmin } from './options'
import { site } from './site'
import { PasswordFormPage } from './templates/pages'
import { capfirst, objectRepr, quote, unquote } from './utils'

const PASSWORD_HELP = 'Raw passwords are not stored, so there is no way to see the user’s password.'

/** Django's UserAdmin: password hash summary, change-password form, and an add form with two password fields. */
export class UserAdmin extends ModelAdmin<any> {
  override fieldsets: Fieldset[] | null = [
    [null, { fields: ['username', 'passwordSummary'] }],
    ['Personal info', { fields: ['firstName', 'lastName', 'email'] }],
    ['Permissions', { fields: ['isActive', 'isStaff', 'isSuperuser', 'groups', 'userPermissions'] }],
    ['Important dates', { fields: ['lastLogin', 'dateJoined'] }],
  ]
  addFieldsets: Fieldset[] = [[null, { classes: ['wide'], fields: ['username', 'password1', 'password2'] }]]
  override listDisplay = ['username', 'email', 'firstName', 'lastName', 'isStaff']
  override listFilter = ['isStaff', 'isSuperuser', 'isActive', 'groups']
  override searchFields = ['username', 'firstName', 'lastName', 'email']
  override ordering = ['username']
  override filterHorizontal = ['groups', 'userPermissions']
  override readonlyFields = ['passwordSummary']

  /** Read-only password hash summary with a link to the change-password form. */
  passwordSummary = display({ description: 'Password' }, (obj: any) => {
    const encoded = obj?.password as string | undefined
    let summary: any
    if (!encoded || !isPasswordUsable(encoded)) {
      summary = <strong>No password set.</strong>
    } else {
      try {
        const hasher = identifyHasher(encoded)
        const parts = hasher.safeSummary(encoded)
        summary = Object.entries(parts).map(([k, v]) => (
          <>
            <strong>{k}</strong>: <bdi>{v}</bdi>{' '}
          </>
        ))
      } catch {
        summary = <strong>Invalid password format or unknown hashing algorithm.</strong>
      }
    }
    let url: string | null = null
    try {
      url = this.url('password_change', obj)
    } catch {}
    return (
      <>
        <div>{summary}</div>
        <div class="help">
          {PASSWORD_HELP}{' '}
          {url ? (
            <>
              You can change the password using <a href={url}>this form</a>.
            </>
          ) : null}
        </div>
      </>
    )
  })

  override async getFieldsets(c: Context, obj?: any): Promise<Fieldset[]> {
    if (!obj) return this.addFieldsets
    return super.getFieldsets(c, obj)
  }

  override getReadonlyFields(_c: Context, obj?: any) {
    return obj ? this.readonlyFields : []
  }

  override getFieldQueryset(c: Context, dbField: Field<any, any>): QuerySet<any> {
    const qs = super.getFieldQueryset(c, dbField)
    if (dbField.name === 'userPermissions') return qs.selectRelated('contentType')
    return qs
  }

  override async getFormFields(c: Context, obj: any, fieldNames?: string[]): Promise<FormField[]> {
    if (obj || fieldNames) return super.getFormFields(c, obj, fieldNames)
    const base = await super.getFormFields(c, null, ['username'])
    const help = passwordValidatorsHelpTexts()
    return [
      ...base,
      new FormField({
        name: 'password1',
        label: 'Password',
        widget: 'password',
        required: true,
        strip: false,
        virtual: true,
        helpText: help.join(' '),
        attrs: { autocomplete: 'new-password' },
      }),
      new FormField({
        name: 'password2',
        label: 'Password confirmation',
        widget: 'password',
        required: true,
        strip: false,
        virtual: true,
        helpText: 'Enter the same password as before, for verification.',
        attrs: { autocomplete: 'new-password' },
      }),
    ]
  }

  override async cleanForm(c: Context, form: ModelForm): Promise<void> {
    await super.cleanForm(c, form)
    if (!form.fields.has('password1')) return
    const p1 = form.cleanedData.password1 as string | undefined
    const p2 = form.cleanedData.password2 as string | undefined
    if (p1 && p2 && p1 !== p2) {
      form.addError('password2', 'The two password fields didn’t match.')
      return
    }
    if (p2) {
      const inst = form.instance as any
      if (form.cleanedData.username) inst.username = form.cleanedData.username
      try {
        await validatePassword(p2, inst)
      } catch (e) {
        if (e instanceof ValidationError) form.addError('password2', e.messages)
        else throw e
      }
    }
  }

  override async saveModel(c: Context, obj: any, form: ModelForm, change: boolean): Promise<void> {
    if (!change && form.cleanedData.password1) await obj.setPassword(form.cleanedData.password1 as string)
    await super.saveModel(c, obj, form, change)
  }

  /** After adding a user, continue to the full change form (like Django). */
  override async responseAdd(c: Context, obj: any, data: FormDataLike): Promise<Response> {
    if (!data.has('_addanother')) {
      const wrapped: FormDataLike = {
        get: (n) => data.get(n),
        getAll: (n) => data.getAll(n),
        has: (n) => n === '_continue' || data.has(n),
      }
      return super.responseAdd(c, obj, wrapped)
    }
    return super.responseAdd(c, obj, data)
  }

  override getUrls(): UrlEntry[] {
    return [
      path(
        '<str:object_id>/password/',
        this.adminSite.adminView((c) => this.userChangePassword(c, kwargs(c).object_id)),
        { name: `${this.urlInfo}_password_change` },
      ),
      ...super.getUrls(),
    ]
  }

  /** Set a user's password (Django's `user_change_password`). */
  async userChangePassword(c: Context, objectIdRaw: string): Promise<Response> {
    const user = (await this.getObject(c, unquote(objectIdRaw))) as any
    if (!(await this.hasChangePermission(c, user))) throw new PermissionDenied()
    if (!user) return this.notFoundRedirect(c, unquote(objectIdRaw))
    const errors: Record<string, string[]> = { password1: [], password2: [] }
    if (c.req.method === 'POST') {
      const data = await c.req.formData().catch(() => new FormData())
      const p1 = String(data.get('password1') ?? '')
      const p2 = String(data.get('password2') ?? '')
      if (!p1) errors.password1.push('This field is required.')
      if (!p2) errors.password2.push('This field is required.')
      if (p1 && p2 && p1 !== p2) errors.password2.push('The two password fields didn’t match.')
      if (p1 && p2 && p1 === p2) {
        try {
          await validatePassword(p2, user)
        } catch (e) {
          if (e instanceof ValidationError) errors.password2.push(...e.messages)
          else throw e
        }
      }
      if (!errors.password1.length && !errors.password2.length) {
        await user.setPassword(p1)
        await user.save()
        await this.logChange(c, user, [{ changed: { fields: ['password'] } }])
        await this.messageUser(c, 'Password changed successfully.', SUCCESS)
        if (getUser(c).pk === user.pk) await updateSessionAuthHash(c, user)
        return c.redirect(this.url('change', user), 302)
      }
    }
    const ctx = await this.adminSite.eachContext(c)
    const help = passwordValidatorsHelpTexts()
    return this.adminSite.render(
      c,
      <PasswordFormPage
        ctx={ctx}
        title={`Change password: ${objectRepr(user)}`}
        breadcrumbs={
          await this.breadcrumbs(c, [
            { label: objectRepr(user), url: this.url('change', user) },
            { label: 'Change password' },
          ])
        }
        action={this.adminSite.reverse(`${this.urlInfo}_password_change`, { object_id: quote(user.pk) })}
        intro={
          <>
            Enter a new password for the user <strong>{objectRepr(user)}</strong>.
          </>
        }
        fields={[
          {
            name: 'password1',
            label: 'Password',
            errors: errors.password1,
            autocomplete: 'new-password',
            help: help.length ? (
              <ul>
                {help.map((h) => (
                  <li>{h}</li>
                ))}
              </ul>
            ) : undefined,
          },
          {
            name: 'password2',
            label: 'Password (again)',
            errors: errors.password2,
            autocomplete: 'new-password',
            help: 'Enter the same password as before, for verification.',
          },
        ]}
        nonFieldErrors={[]}
        submitLabel="Change password"
        bodyClass={`${this.bodyClass('change-form')}`}
      />,
    )
  }
}

/** Django's GroupAdmin. */
export class GroupAdmin extends ModelAdmin<any> {
  override searchFields = ['name']
  override ordering = ['name']
  override filterHorizontal = ['permissions']

  override getFieldQueryset(c: Context, dbField: Field<any, any>): QuerySet<any> {
    const qs = super.getFieldQueryset(c, dbField)
    if (dbField.name === 'permissions') return qs.selectRelated('contentType')
    return qs
  }
}

// Registered when @ghuri/admin is imported; only active when the models are installed (and auth.User isn't swapped).
site.register(User, UserAdmin, { auto: true })
site.register(Group, GroupAdmin, { auto: true })
void Permission
void capfirst
void getUserModel
