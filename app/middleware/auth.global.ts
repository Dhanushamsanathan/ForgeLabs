export default defineNuxtRouteMiddleware(async to => {
  const request = useRequestFetch()
  const session = await request('/api/auth/session')
  if (!session.authenticated && to.path !== '/login') return navigateTo('/login')
  if (session.authenticated && to.path === '/login') return navigateTo('/')
})
