import { randomUUID } from 'node:crypto'
import { datasetInput } from '#shared/validation'
export default defineEventHandler(async event => {
  const data = await input(event, datasetInput), id = randomUUID()
  await rows('INSERT INTO datasets (id,name,source,reference,config,labelOrigin,description) VALUES (?,?,?,?,?,?,?)', [id,data.name,data.source,data.reference,data.config,data.labelOrigin,data.description])
  return { id }
})
