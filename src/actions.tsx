// Built-in admin actions (Django's django.contrib.admin.actions).
import type { BaseModel, QuerySet } from '@ghuri/orm'
import type { Context } from 'hono'
import { action } from './decorators'
import { SUCCESS } from './messages'
import type { ModelAdmin } from './options'
import { DeleteConfirmationPage } from './templates/pages'
import { capfirst, objectRepr } from './utils'

/** "Delete selected <objects>" with a confirmation page (Django's `delete_selected`). */
export const deleteSelected = action(
  { description: 'Delete selected %(verbose_name_plural)s', permissions: ['delete'] },
  async function delete_selected(modelAdmin: ModelAdmin<any>, c: Context, queryset: QuerySet<any>) {
    const meta = modelAdmin.model._meta
    const objs = (await queryset) as BaseModel[]
    const { deleted, modelCount, permsNeeded, protected: prot } = await modelAdmin.getDeletedObjects(objs, c)
    const data = await c.req.formData().catch(() => null)
    if (data?.has('post') && !permsNeeded.length && !prot.length) {
      const n = objs.length
      if (n) {
        for (const obj of objs) await modelAdmin.logDeletion(c, obj, objectRepr(obj))
        await modelAdmin.deleteQueryset(c, queryset)
        await modelAdmin.messageUser(
          c,
          `Successfully deleted ${n} ${n === 1 ? meta.verboseName : meta.verboseNamePlural}.`,
          SUCCESS,
        )
      }
      return null
    }
    const objectName = objs.length === 1 ? meta.verboseName : meta.verboseNamePlural
    const ctx = await modelAdmin.adminSite.eachContext(c)
    const url = new URL(c.req.url)
    const title = permsNeeded.length || prot.length ? `Cannot delete ${objectName}` : 'Are you sure?'
    const hidden: Array<[string, string]> = [
      ['action', 'delete_selected'],
      ...objs.map((o): [string, string] => ['_selected_action', String(o.pk)]),
    ]
    return modelAdmin.adminSite.render(
      c,
      <DeleteConfirmationPage
        ctx={ctx}
        title={title}
        breadcrumbs={[
          { label: 'Home', url: modelAdmin.adminSite.reverse('index') },
          {
            label: modelAdmin.adminSite.appVerboseName(meta.appLabel),
            url: modelAdmin.adminSite.tryReverse('app_list', { app_label: meta.appLabel }),
          },
          { label: capfirst(meta.verboseNamePlural), url: modelAdmin.url('changelist') },
          { label: 'Delete multiple objects' },
        ]}
        bodyClass={`app-${meta.appLabel} model-${meta.modelName} delete-confirmation delete-selected-confirmation`}
        objectName={objectName}
        objectRepr=""
        deletedObjects={deleted}
        modelCount={modelCount}
        permsLacking={permsNeeded}
        protectedObjects={prot}
        hidden={hidden}
        action={`${url.pathname}${url.search}`}
        cancelUrl={`${url.pathname}${url.search}`}
        bulk
        currentModel={modelAdmin.model}
      />,
    )
  },
)
