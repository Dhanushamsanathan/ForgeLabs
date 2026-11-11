import type { Run } from '#shared/types'
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  const [run] = await rows<Run>('SELECT * FROM runs WHERE id = ?', [id])
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  const [metrics, logs, artifacts] = await Promise.all([
    rows("SELECT * FROM run_events WHERE runId = ? AND kind != 'log' ORDER BY sequence DESC LIMIT 2000", [id]),
    rows("SELECT * FROM run_events WHERE runId = ? AND kind = 'log' ORDER BY sequence DESC LIMIT 300", [id]),
    rows('SELECT * FROM artifacts WHERE runId = ? ORDER BY createdAt DESC', [id]),
  ])
  return { run, metrics: metrics.reverse(), logs: logs.reverse(), artifacts }
})
