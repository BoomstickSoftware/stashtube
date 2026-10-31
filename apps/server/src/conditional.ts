// Conditional GETs for /api: every successful GET answer carries a weak ETag of its JSON body
// and `Cache-Control: private, no-cache`, so the browser keeps a copy and revalidates it with
// If-None-Match on the next fetch; an unchanged answer is a 304 with no body. The BFF's query
// cache makes the bodies stable, so the refetch storm when the app returns to the foreground
// (every stale list at once) becomes a handful of 304s instead of full downloads.
//
// Registered inside `compress()` (after it): the ETag is of the JSON, the 304 has no body to
// compress, and compress marks any strong tag weak if it ever met one. `no-cache` is "always
// revalidate", not "never store"; `private` keeps a shared cache on the way out of it.
import type { MiddlewareHandler } from 'hono'
import { etag } from 'hono/etag'

const cacheControl: MiddlewareHandler = async (c, next) => {
  await next()
  if (c.req.method === 'GET' && (c.res.ok || c.res.status === 304)) c.header('cache-control', 'private, no-cache')
}

export const conditional: MiddlewareHandler[] = [cacheControl, etag({ weak: true })]
