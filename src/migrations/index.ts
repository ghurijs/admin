// Every migration of the admin app, in order.
import m0001_initial from './0001_initial'

export { m0001_initial }

/** Every migration of this app by name, in order. */
export const migrations = {
  '0001_initial': m0001_initial,
}
