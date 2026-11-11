import { z } from 'zod'
const attempts = new Map<string, { count: number; until: number }>()
export default defineEventHandler(async event => {
  const key = getRequestIP(event) || 'unknown'
  const current = attempts.get(key)
  if (current && current.until > Date.now() && current.count >= 10) throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Try again in 15 minutes.' })
  const { password } = await input(event, z.object({ password: z.string().max(500) }))
  const expected = useRuntimeConfig().operatorPassword
  if (!expected) throw createError({ statusCode: 503, statusMessage: 'Set NUXT_OPERATOR_PASSWORD in the environment.' })
  if (!equal(password, expected)) {
    for (const [ip, value] of attempts) if (value.until < Date.now()) attempts.delete(ip)
    attempts.set(key, { count: (current && current.until > Date.now() ? current.count : 0) + 1, until: Date.now() + 900_000 })
    throw createError({ statusCode: 401, statusMessage: 'Incorrect workspace password' })
  }
  attempts.delete(key)
  setCookie(event, 'forgelabs_session', sessionValue(), { httpOnly: true, sameSite: 'strict', secure: getRequestURL(event).protocol === 'https:', maxAge: 43200, path: '/' })
  return { ok: true }
})
