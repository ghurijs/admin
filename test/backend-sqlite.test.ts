import { afterAll, beforeAll, describe, it } from 'vitest'
import { type AdminTestSetup, setupAdmin } from './helpers'
import { adminScenario } from './scenario'

describe('admin on sqlite', () => {
  let s: AdminTestSetup
  beforeAll(async () => {
    s = await setupAdmin({ using: 'sqlite' })
  })
  afterAll(async () => {
    await s?.db.teardown()
  })
  it('works end to end', async () => {
    await adminScenario(s)
  })
})
