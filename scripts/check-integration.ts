import mysql from 'mysql2/promise'
import { schema } from '../server/utils/schema'
import { randomBytes } from 'node:crypto'

const source = process.env.NUXT_DATABASE_URL
if (!source) throw new Error('Configure NUXT_DATABASE_URL first.')
const dbName = `forgelabs_test_${Date.now()}`
const base = new URL(source)
base.pathname = '/'
const admin = await mysql.createConnection(base.toString())
let server: ReturnType<typeof Bun.spawn> | undefined
try {
  await admin.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4`)
  base.pathname = '/' + dbName
  const db = await mysql.createConnection(base.toString())
  try { for (const statement of schema) await db.query(statement) } finally { await db.end() }
  const env = { ...process.env, NUXT_DATABASE_URL: base.toString(), NUXT_OPERATOR_PASSWORD: randomBytes(24).toString('hex'), NUXT_SESSION_SECRET: randomBytes(32).toString('hex'), HOST: '127.0.0.1', PORT: '3181', FORGELABS_TEST_URL: 'http://127.0.0.1:3181' }
  server = Bun.spawn(['bun', '.output/server/index.mjs'], { env, stdout: 'inherit', stderr: 'inherit' })
  let available = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(env.FORGELABS_TEST_URL + '/api/auth/session')).ok) { available = true; break } } catch {}
    await Bun.sleep(200)
  }
  if (!available) throw new Error('Test server did not become ready')
  const tests = Bun.spawn(['bun', 'test', 'tests'], { env, stdout: 'inherit', stderr: 'inherit' })
  if (await tests.exited) throw new Error('Integration tests failed')
  if (process.argv.includes('--browser')) {
    const browser = Bun.spawn(['bun', 'scripts/check-browser.ts'], { env, stdout: 'inherit', stderr: 'inherit' })
    if (await browser.exited) throw new Error('Browser checks failed')
  }
} finally {
  if (server) { server.kill(); await server.exited }
  await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await admin.end()
}
