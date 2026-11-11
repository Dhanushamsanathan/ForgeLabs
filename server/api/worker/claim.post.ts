export default defineEventHandler(async event => {
  const server = await workerAuth(event)
  const connection = await database().getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('SELECT id FROM servers WHERE id = ? FOR UPDATE', [server.id])
    const [active]: any = await connection.execute("SELECT id FROM runs WHERE serverId = ? AND status = 'running' LIMIT 1", [server.id])
    if (active.length) { await connection.commit(); return { run: null } }
    const [queued]: any = await connection.execute("SELECT * FROM runs WHERE serverId = ? AND status = 'queued' ORDER BY createdAt LIMIT 1 FOR UPDATE", [server.id])
    if (!queued.length) { await connection.commit(); return { run: null } }
    await connection.execute("UPDATE runs SET status = 'running', startedAt = UTC_TIMESTAMP(3) WHERE id = ?", [queued[0].id])
    await connection.commit()
    return { run: decode({ ...queued[0], status: 'running' }) }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
})
