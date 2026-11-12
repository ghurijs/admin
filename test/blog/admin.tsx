import type { QuerySet } from '@ghuri/orm'
import type { Context } from 'hono'
import {
  action,
  admin,
  display,
  ModelAdmin,
  SimpleListFilter,
  StackedInline,
  TabularInline,
} from '../../src/index'
import { Category, Comment, Post, Publisher, Tag } from './models'

export class CommentInline extends TabularInline<Comment> {
  model = Comment
  extra = 1
}

export class StackedCommentInline extends StackedInline<Comment> {
  model = Comment
  extra = 0
}

class PopularFilter extends SimpleListFilter {
  title = 'popularity'
  parameterName = 'popular'
  lookups() {
    return [
      ['yes', 'Popular'],
      ['no', 'Not popular'],
    ] as Array<[unknown, string]>
  }
  queryset(_c: Context, qs: QuerySet<any>) {
    if (this.value() === 'yes') return qs.filter({ views__gte: 100 })
    if (this.value() === 'no') return qs.filter({ views__lt: 100 })
    return qs
  }
}

export const makePublished = action(
  { description: 'Mark selected %(verbose_name_plural)s as published', permissions: ['change'] },
  async function make_published(modelAdmin: ModelAdmin, c: Context, queryset: QuerySet<any>) {
    const n = await queryset.update({ published: true, status: 'published' })
    await modelAdmin.messageUser(c, `${n} posts were marked as published.`, 'success')
  },
)

@admin.register(Post)
export class PostAdmin extends ModelAdmin<Post> {
  override listDisplay = ['title', 'status', 'published', 'category', 'shout', 'views']
  override listFilter = ['published', 'status', 'category', 'createdAt', PopularFilter]
  override searchFields = ['title', '^slug', 'author__username']
  override dateHierarchy = 'createdAt'
  override prepopulatedFields = { slug: ['title'] }
  override readonlyFields = ['views', 'wordCount']
  override inlines = [CommentInline]
  override actions = [makePublished, 'markDraft']
  override listPerPage = 5
  override autocompleteFields = ['category']
  override filterHorizontal = ['tags']
  override saveAs = true
  override fieldsets: any = [
    [null, { fields: ['title', 'slug', 'body', 'status'] }],
    [
      'Meta',
      {
        fields: [
          ['published', 'category'],
          'publisher',
          'author',
          'tags',
          'createdAt',
          'publishDate',
          'metadata',
          'views',
          'wordCount',
        ],
        classes: ['collapse'],
        description: 'Extra data',
      },
    ],
  ]

  @display({ description: 'Shout', ordering: 'title' })
  shout(obj: Post) {
    return obj.title.toUpperCase()
  }

  @action({ description: 'Mark as draft', permissions: ['change'] })
  async markDraft(c: Context, qs: QuerySet<Post>) {
    const n = await qs.update({ status: 'draft', published: false })
    await this.messageUser(c, `${n} marked as draft.`)
  }
}

@admin.register(Category)
export class CategoryAdmin extends ModelAdmin<Category> {
  override searchFields = ['name']
  override listEditable = []
}

@admin.register(Tag)
export class TagAdmin extends ModelAdmin<Tag> {
  override searchFields = ['name']
}

admin.site.register(Publisher)

export class CommentAdmin extends ModelAdmin<Comment> {
  override listDisplay = ['author', 'post', 'approved']
  override listEditable = ['approved']
  override rawIdFields = ['post']
  override listFilter = ['approved']
}
admin.site.register(Comment, CommentAdmin)
void StackedCommentInline
