import type { Server, Model, Dataset, Run } from '#shared/types'
export default defineEventHandler(async () => {
  const [servers, models, datasets, runs] = await Promise.all([
    rows<Server>('SELECT id, name, description, telemetry, lastSeen, createdAt FROM servers ORDER BY createdAt DESC'),
    rows<Model>('SELECT * FROM models ORDER BY createdAt DESC'),
    rows<Dataset>('SELECT * FROM datasets ORDER BY createdAt DESC'),
    rows<Run>('SELECT * FROM runs ORDER BY createdAt DESC LIMIT 200'),
  ])
  return { servers, models, datasets, runs }
})
