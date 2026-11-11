export default defineEventHandler(event => {
  if (!event.path.startsWith('/api/')) return
  setHeader(event, 'Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.method)) {
    const origin = getHeader(event, 'origin')
    if (origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, statusMessage: 'Cross-origin request rejected' })
  }
  const path = event.path.split('?')[0]
  if (['/api/auth/login', '/api/auth/session'].includes(path!) || path?.startsWith('/api/worker/')) return
  if (!authenticated(event)) throw createError({ statusCode: 401, statusMessage: 'Sign in to your workspace' })
})
