// @ghuri/admin — the Django admin for Ghuri. See ARCHITECTURE.md §9 (github.com/ghurijs/ghuri).
// Workers-safe: SSR with hono/jsx, no Node-only imports. @ghuri/storage is optional (file fields are duck-typed).
import { deleteSelected } from './actions'
import { AdminConfig } from './app'
import { GroupAdmin, UserAdmin } from './auth-admin'
import { action, display } from './decorators'
import {
  AllValuesFieldListFilter,
  BooleanFieldListFilter,
  ChoicesFieldListFilter,
  DateFieldListFilter,
  EmptyFieldListFilter,
  FieldListFilter,
  ListFilter,
  RelatedFieldListFilter,
  RelatedOnlyFieldListFilter,
  SimpleListFilter,
} from './filters'
import { HORIZONTAL, InlineModelAdmin, ModelAdmin, StackedInline, TabularInline, VERTICAL } from './options'
import { AdminSite, register, site } from './site'

export { deleteSelected } from './actions'
export { AdminConfig } from './app'
export { GroupAdmin, UserAdmin } from './auth-admin'
export {
  ACTION_CHECKBOX,
  ALL_VAR,
  ChangeList,
  type ChangeListOptions,
  ERROR_FLAG,
  IncorrectLookupParameters,
  type ListFilterItem,
  ORDER_VAR,
  PAGE_VAR,
  SEARCH_VAR,
} from './changelist'
export {
  type ActionOptions,
  action,
  type DisplayOptions,
  display,
  getActionOptions,
  getDisplayOptions,
} from './decorators'
export {
  displayForField,
  displayForValue,
  type ListDisplayItem,
  labelForField,
  lookupField,
} from './display'
export {
  AllValuesFieldListFilter,
  BooleanFieldListFilter,
  ChoicesFieldListFilter,
  DateFieldListFilter,
  EmptyFieldListFilter,
  FieldListFilter,
  type FilterChoice,
  ListFilter,
  RelatedFieldListFilter,
  RelatedOnlyFieldListFilter,
  SimpleListFilter,
} from './filters'
export {
  type Choice,
  type FormDataLike,
  FormField,
  type FormFieldOptions,
  type FormsetSaveResult,
  InlineFormSet,
  ModelForm,
  type ModelFormOptions,
  toFormData,
  type WidgetType,
} from './forms'
export {
  addMessage,
  consumeMessages,
  DEBUG,
  ERROR,
  INFO,
  type Message,
  type MessageLevel,
  SUCCESS,
  WARNING,
} from './messages'
export {
  ACTION_FLAG_CHOICES,
  ADDITION,
  CHANGE,
  type ChangeMessage,
  type ChangeMessageEntry,
  DELETION,
  LogEntry,
  LogEntryManager,
} from './models'
export {
  type ActionFunction,
  BaseModelAdmin,
  constructSearch,
  type Fieldset,
  type FieldsetOptions,
  type FieldsetsInput,
  type FormfieldOverrides,
  flattenFieldsets,
  getForeignKey,
  HORIZONTAL,
  InlineModelAdmin,
  ModelAdmin,
  normalizeFieldsets,
  type ResolvedAction,
  StackedInline,
  TabularInline,
  VERTICAL,
} from './options'
export {
  type AdminAssetsSetting,
  AdminSite,
  type AdminSiteOptions,
  AlreadyRegistered,
  DEFAULT_HTMX_URL,
  type ModelAdminClass,
  NotRegistered,
  register,
  site,
  VERSION,
} from './site'
export type { AdminContext, AppEntry, Crumb, ModelEntry } from './templates/base'
export { quote, unquote } from './utils'

/**
 * Django's `from django.contrib import admin` namespace:
 * `admin.site.register(...)`, `@admin.register(Post)`, `admin.ModelAdmin`, `admin.display`, …
 */
export const admin = {
  site,
  register,
  AdminSite,
  AdminConfig,
  ModelAdmin,
  InlineModelAdmin,
  TabularInline,
  StackedInline,
  display,
  action,
  ListFilter,
  SimpleListFilter,
  FieldListFilter,
  BooleanFieldListFilter,
  ChoicesFieldListFilter,
  DateFieldListFilter,
  AllValuesFieldListFilter,
  RelatedFieldListFilter,
  RelatedOnlyFieldListFilter,
  EmptyFieldListFilter,
  UserAdmin,
  GroupAdmin,
  HORIZONTAL,
  VERTICAL,
  deleteSelected,
}
