import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
export const digest = (v: string) => createHash('sha256').update(v).digest('hex')
export const newToken = () => randomBytes(32).toString('hex')
export const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)))
export function sessionValue() {
  const secret = useRuntimeConfig().sessionSecret
  if (secret.length < 32) throw createError({ statusCode: 503, statusMessage: 'Configure a session secret of at least 32 characters.' })
  const expires = String(Date.now() + 12 * 60 * 60 * 1000)
  return `${expires}.${createHmac('sha256', secret).update(expires).digest('hex')}`
}
export function authenticated(event: H3Event) {
  const secret = useRuntimeConfig().sessionSecret
  const cookie = getCookie(event, 'forgelabs_session') || ''
  const [expires = '', signature = ''] = cookie.split('.')
  return secret.length >= 32 && Number(expires) > Date.now() && equal(signature, createHmac('sha256', secret).update(expires).digest('hex'))
}
export async function workerAuth(event: H3Event) {
  const id = getHeader(event, 'x-worker-id') || ''
  const token = (getHeader(event, 'authorization') || '').replace(/^Bearer /, '')
  if (!id || token.length !== 64) throw createError({ statusCode: 401, statusMessage: 'Worker authentication required' })
  const [server] = await rows('SELECT * FROM servers WHERE id = ?', [id])
  if (!server || !equal(digest(token), server.tokenHash)) throw createError({ statusCode: 401, statusMessage: 'Invalid worker credentials' })
  return server
}
export async function ownedRun(event: H3Event) {
  const server = await workerAuth(event)
  const [run] = await rows('SELECT * FROM runs WHERE id = ? AND serverId = ?', [getRouterParam(event, 'id'), server.id])
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  return run
}
