import type { ZodType } from 'zod'
import type { H3Event } from 'h3'
export async function input<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  if (Number(getHeader(event, 'content-length') || 0) > 2_000_000) throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  const value = schema.safeParse(await readBody(event))
  if (!value.success) throw createError({ statusCode: 400, statusMessage: value.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 500) })
  return value.data
}
