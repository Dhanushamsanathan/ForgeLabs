import { z } from 'zod'
export default defineEventHandler(async event => {
  const server = await workerAuth(event)
  const telemetry = await input(event, z.object({
    hostname: z.string().max(200), workerVersion: z.string().max(50), activeRunId: z.string().uuid().nullable(),
    diskFreeGb: z.number().nonnegative(), recipes: z.array(z.string().max(100)).max(20),
    gpus: z.array(z.object({ name: z.string().max(200), memoryTotal: z.number().nonnegative(), memoryUsed: z.number().nonnegative(), utilization: z.number().min(0).max(100) })).max(16),
  }))
  await rows('UPDATE servers SET lastSeen = UTC_TIMESTAMP(3), telemetry = ? WHERE id = ?', [JSON.stringify(telemetry), server.id])
  return { ok: true }
})
