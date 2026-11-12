import { createApp, defineSettings, path } from '@ghuri/core'
import { createTestClient } from '@ghuri/core/testing'
import type { Context } from 'hono'
import { describe, expect, it } from 'vitest'
import { addMessage, consumeMessages } from '../src/index'

// Without SessionMiddleware messages travel in a signed cookie.
describe('messages (cookie store)', () => {
  const app = createApp(
    defineSettings(() => ({
      SECRET_KEY: 'messages-secret',
      INSTALLED_APPS: [],
      ROOT_URLCONF: [
        path('add/', async (c: Context) => {
          await addMessage(c, 'success', 'Saved <b>it</b>')
          await addMessage(c, 'warning', 'Careful')
          return c.text('ok')
        }),
        path('show/', async (c: Context) => c.json(await consumeMessages(c))),
      ],
    })),
  )

  it('round-trips and rejects forged cookies', async () => {
    const client = createTestClient(app, { env: {} })
    await client.get('/add/')
    expect(client.getCookie('messages')).toBeTruthy()
    const msgs = (await (await client.get('/show/')).json()) as any[]
    expect(msgs).toEqual([
      { level: 25, message: 'Saved <b>it</b>', tags: 'success' },
      { level: 30, message: 'Careful', tags: 'warning' },
    ])
    expect(await (await client.get('/show/')).json()).toEqual([])
    client.setCookie('messages', btoa(JSON.stringify([[40, 'forged']])))
    expect(await (await client.get('/show/')).json()).toEqual([])
  })
})
