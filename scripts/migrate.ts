import mysql from 'mysql2/promise'
import { schema } from '../server/utils/schema'
const url = process.env.NUXT_DATABASE_URL
if (!url) throw new Error('Set NUXT_DATABASE_URL in .env before migrating.')
const connection = await mysql.createConnection(url)
try {
  for (const statement of schema) await connection.query(statement)
  console.log('ForgeLabs database schema is ready.')
} finally { await connection.end() }
