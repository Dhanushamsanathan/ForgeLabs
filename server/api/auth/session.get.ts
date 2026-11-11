export default defineEventHandler(event => ({ authenticated: authenticated(event), configured: Boolean(useRuntimeConfig().operatorPassword && useRuntimeConfig().sessionSecret.length >= 32) }))
