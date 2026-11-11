import { eventInput } from '#shared/validation'
export default defineEventHandler(async event => {
  const run = await ownedRun(event)
  const { events } = await input(event, eventInput)
  if (run.status !== 'running') return { ok: true, cancelRequested: run.cancelRequested, terminal: true }
  const connection = await database().getConnection()
  try {
    await connection.beginTransaction()
    for (const item of events) await connection.execute('INSERT IGNORE INTO run_events (id,runId,kind,step,payload) VALUES (?,?,?,?,?)', [item.id,run.id,item.kind,item.step,JSON.stringify(item.payload)])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
  return { ok: true, cancelRequested: run.cancelRequested }
})
