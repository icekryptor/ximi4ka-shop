// Session + CSRF cookie names and lifetimes. Kept in a shared module so that
// both the auth routes and the middleware agree.
export const SESSION_COOKIE_NAME = 'ximi4ka_shop_session'
export const CSRF_COOKIE_NAME = 'ximi4ka_shop_csrf'

// 30 days in seconds — balanced session length for editor workflow.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000

// A precomputed argon2 hash used to make unknown-email login attempts spend
// roughly the same time as wrong-password attempts on known accounts. The
// password here is random and has no meaning — the hash is only ever used as
// a timing-attack decoy and never compared for acceptance.
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZS1kdW1teS1zYWx0$KUGKdvH2h1gKj6XY3B7oVbfbEDOhhJUOK5y2rqpZ2wQ'
