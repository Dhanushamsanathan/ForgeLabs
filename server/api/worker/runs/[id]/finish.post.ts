import { z } from 'zod'
import { randomUUID } from 'node:crypto'
export default defineEventHandler(async event => {
  const run = await ownedRun(event)
  const data = await input(event, z.object({ status: z.enum(['completed', 'failed', 'cancelled']), error: z.string().max(4000).nullable().default(null), artifacts: z.array(z.object({ name: z.string().max(100), path: z.string().max(1000), kind: z.string().max(40) })).max(50).default([]) }))
  const connection = await database().getConnection()
  try {
    await connection.beginTransaction()
    const [result]: any = await connection.execute("UPDATE runs SET status = ?, error = ?, finishedAt = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'running'", [data.status,data.error,run.id])
    if (result.affectedRows) for (const artifact of data.artifacts) await connection.execute('INSERT INTO artifacts (id,runId,name,path,kind) VALUES (?,?,?,?,?)', [randomUUID(),run.id,artifact.name,artifact.path,artifact.kind])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
  return { ok: true }
})
