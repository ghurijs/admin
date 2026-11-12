import { AppConfig } from '@ghuri/core'
import * as admin from './admin'
import * as models from './models'

export class BlogConfig extends AppConfig {
  name = 'blog'
  override verboseName = 'Blog'
  override models = models
  override admin = admin
}
