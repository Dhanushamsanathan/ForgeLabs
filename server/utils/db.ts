import mysql, { type Pool } from 'mysql2/promise'
let pool: Pool | undefined
export function database() {
  const url = useRuntimeConfig().databaseUrl
  if (!url) throw createError({ statusCode: 503, statusMessage: 'Database is not configured. Set NUXT_DATABASE_URL and run bun run db:migrate.' })
  return pool ||= mysql.createPool({ uri: url, connectionLimit: 8, timezone: 'Z', dateStrings: true })
}
export function decode<T>(row: any): T {
  if (!row) return row
  const result = { ...row }
  for (const key of ['config', 'snapshot', 'telemetry', 'payload']) {
    if (typeof result[key] === 'string' && /^[{[]/.test(result[key])) {
      try { result[key] = JSON.parse(result[key]) } catch { /* plain dataset config */ }
    }
  }
  if ('cancelRequested' in result) result.cancelRequested = Boolean(result.cancelRequested)
  for (const key of ['createdAt', 'startedAt', 'finishedAt', 'lastSeen']) {
    if (result[key] && !String(result[key]).endsWith('Z')) result[key] = String(result[key]).replace(' ', 'T') + 'Z'
  }
  return result
}
export async function rows<T = any>(sql: string, values: any[] = []): Promise<T[]> {
  try {
    const [result] = await database().execute(sql, values)
    return Array.isArray(result) ? result.map(row => decode<T>(row)) : []
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Database operation failed:', error.code)
    throw createError({ statusCode: 503, statusMessage: 'Database unavailable. Check the connection and run migrations.' })
  }
}
