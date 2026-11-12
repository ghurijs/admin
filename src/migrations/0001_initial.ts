// Initial migration of the admin app (Django's admin 0001_initial): the `django_admin_log` table.
import { Migration, operations as ops } from '@ghuri/orm/migrations'

export default new Migration({
  initial: true,
  dependencies: [
    ['auth', '0001_initial'],
    ['contenttypes', '0001_initial'],
  ],
  operations: [
    ops.CreateModel({
      name: 'LogEntry',
      fields: {
        id: { type: 'BigAutoField', primaryKey: true },
        actionTime: {
          type: 'DateTimeField',
          editable: false,
          default: { callable: 'now' },
          verboseName: 'action time',
        },
        user: {
          type: 'ForeignKey',
          to: 'auth.User',
          onDelete: 'CASCADE',
          dbIndex: true,
          verboseName: 'user',
        },
        contentType: {
          type: 'ForeignKey',
          to: 'contenttypes.ContentType',
          onDelete: 'SET_NULL',
          null: true,
          blank: true,
          dbIndex: true,
          verboseName: 'content type',
        },
        objectId: { type: 'TextField', null: true, blank: true, verboseName: 'object id' },
        objectRepr: { type: 'CharField', maxLength: 200, verboseName: 'object repr' },
        actionFlag: {
          type: 'PositiveSmallIntegerField',
          choices: [
            [1, 'Addition'],
            [2, 'Change'],
            [3, 'Deletion'],
          ],
          verboseName: 'action flag',
        },
        changeMessage: { type: 'TextField', blank: true, verboseName: 'change message' },
      },
      options: {
        dbTable: 'django_admin_log',
        ordering: ['-actionTime'],
        verboseName: 'log entry',
        verboseNamePlural: 'log entries',
      },
    }),
  ],
})
