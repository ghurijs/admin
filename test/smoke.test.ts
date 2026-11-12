import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AdminTestSetup, setupAdmin } from './helpers'

describe('smoke', () => {
  let s: AdminTestSetup
  beforeAll(async () => {
    s = await setupAdmin()
  })
  afterAll(async () => {
    await s?.db.teardown()
  })
  it('renders the index for a superuser', async () => {
    await s.superuser()
    const res = await s.client.get('/admin/')
    const body = await res.text()
    if (res.status !== 200) console.log(body.slice(0, 3000))
    expect(res.status).toBe(200)
    expect(body).toContain('Site administration')
  })
})
