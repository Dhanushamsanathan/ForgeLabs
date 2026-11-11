export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  const [run] = await rows('SELECT * FROM runs WHERE id = ?', [id])
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  await rows("UPDATE runs SET cancelRequested = TRUE, finishedAt = IF(status = 'queued', UTC_TIMESTAMP(3), finishedAt), status = IF(status = 'queued', 'cancelled', status) WHERE id = ? AND status IN ('queued','running')", [id])
  return { ok: true }
})
