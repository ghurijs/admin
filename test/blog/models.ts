import { User } from '@ghuri/auth'
import {
  BooleanField,
  CASCADE,
  CharField,
  DateField,
  DateTimeField,
  ForeignKey,
  IntegerField,
  JSONField,
  type Manager,
  ManyToManyField,
  Model,
  PROTECT,
  SET_NULL,
  SlugField,
  TextField,
} from '@ghuri/orm'

export class Category extends Model({
  name: new CharField({ maxLength: 100, unique: true }),
}) {
  static Meta = { verboseNamePlural: 'categories', ordering: ['name'] }
  declare static objects: Manager<Category>
  override toString() {
    return this.name
  }
}

export class Publisher extends Model({
  name: new CharField({ maxLength: 100 }),
}) {
  declare static objects: Manager<Publisher>
  override toString() {
    return this.name
  }
}

export class Tag extends Model({
  name: new CharField({ maxLength: 50, unique: true }),
}) {
  static Meta = { ordering: ['name'] }
  declare static objects: Manager<Tag>
  override toString() {
    return this.name
  }
}

export class Post extends Model({
  title: new CharField({ maxLength: 200 }),
  slug: new SlugField({ unique: true }),
  body: new TextField({ blank: true }),
  status: new CharField({
    maxLength: 20,
    choices: [
      ['draft', 'Draft'],
      ['published', 'Published'],
    ],
    default: 'draft',
  }),
  published: new BooleanField({ default: false }),
  category: new ForeignKey(() => Category, { onDelete: SET_NULL, null: true, blank: true }),
  publisher: new ForeignKey(() => Publisher, { onDelete: PROTECT, null: true, blank: true }),
  author: new ForeignKey(() => User, { onDelete: SET_NULL, null: true, blank: true }),
  tags: new ManyToManyField(() => Tag, { blank: true }),
  createdAt: new DateTimeField({ default: () => new Date() }),
  publishDate: new DateField({ null: true, blank: true }),
  metadata: new JSONField({ null: true, blank: true }),
  views: new IntegerField({ default: 0 }),
}) {
  static Meta = { ordering: ['-createdAt'] }
  declare static objects: Manager<Post>
  override toString() {
    return this.title
  }
  wordCount() {
    return this.body ? this.body.split(/\s+/).filter(Boolean).length : 0
  }
  getAbsoluteUrl() {
    return `/blog/${this.slug}/`
  }
}

export class Comment extends Model({
  post: new ForeignKey(() => Post, { onDelete: CASCADE, relatedName: 'comments' }),
  author: new CharField({ maxLength: 100 }),
  text: new TextField(),
  approved: new BooleanField({ default: false }),
}) {
  declare static objects: Manager<Comment>
  override toString() {
    return `Comment by ${this.author}`
  }
}
