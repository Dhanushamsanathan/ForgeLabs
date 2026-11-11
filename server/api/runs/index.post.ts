import { randomUUID } from 'node:crypto'
import { runInput } from '#shared/validation'
export default defineEventHandler(async event => {
  const data = await input(event, runInput)
  const [[model], [dataset], [server]] = await Promise.all([
    rows('SELECT * FROM models WHERE id = ?', [data.modelId]),
    rows('SELECT * FROM datasets WHERE id = ?', [data.datasetId]),
    rows('SELECT name FROM servers WHERE id = ?', [data.serverId]),
  ])
  if (!model || !dataset || !server) throw createError({ statusCode: 400, statusMessage: 'Choose an existing model, dataset, and server.' })
  const id = randomUUID()
  const snapshot = { model, dataset, serverName: server.name, recipe: dataset.source === 'manifest' ? 'tamil-whisper-manifest' : 'tamil-whisper-fleurs' }
  await rows('INSERT INTO runs (id,name,serverId,modelId,datasetId,status,config,snapshot) VALUES (?,?,?,?,?,?,?,?)', [id,data.name,data.serverId,data.modelId,data.datasetId,'queued',JSON.stringify(data.config),JSON.stringify(snapshot)])
  return { id }
})
