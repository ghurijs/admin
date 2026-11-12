// Typical user code from ARCHITECTURE.md §9 must type-check without annotations (tsc runs on test/).
import type { QuerySet } from '@ghuri/orm'
import type { Context } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  AdminSite,
  action,
  admin,
  ModelAdmin,
  RelatedOnlyFieldListFilter,
  StackedInline,
  TabularInline,
} from '../src/index'
import { Comment, Post } from './blog/models'

const makePublished = action(
  { description: 'Publish' },
  async (_ma: ModelAdmin, _c: Context, qs: QuerySet<Post>) => {
    await qs.update({ published: true })
  },
)

class CommentInline extends TabularInline<Comment> {
  model = Comment
  extra = 1
}
class CommentStacked extends StackedInline<Comment> {
  model = Comment
}

class PostAdmin extends ModelAdmin<Post> {
  listDisplay = ['title', 'author', 'published', 'createdAt']
  listFilter = ['published', 'createdAt', ['category', RelatedOnlyFieldListFilter]]
  searchFields = ['title', 'body']
  prepopulatedFields = { slug: ['title'] }
  readonlyFields = ['createdAt']
  fieldsets = [
    [null, { fields: ['title', 'slug', 'body'] }],
    ['Meta', { fields: ['author', 'tags', 'published'], classes: ['collapse'] }],
  ]
  inlines = [CommentInline, CommentStacked]
  actions = [makePublished]
  listPerPage = 50
  ordering = ['-createdAt']
  dateHierarchy = 'createdAt'
  rawIdFields = ['author']
  radioFields = { status: admin.HORIZONTAL, category: 'vertical' }
  formfieldOverrides = { TextField: { widget: 'text', attrs: { size: 60 } } }
}

describe('typing', () => {
  it('accepts plain class-field literals', async () => {
    const site = new AdminSite({ name: 'types' })
    const ma = new PostAdmin(Post, site)
    const fieldsets = await ma.getFieldsets({} as Context, null)
    expect(fieldsets[1][0]).toBe('Meta')
    expect(fieldsets[1][1].classes).toEqual(['collapse'])
  })
})
