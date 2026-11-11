import { randomUUID } from 'node:crypto'
import { modelInput } from '../../../shared/validation'
export default defineEventHandler(async event => {
  const data = await input(event, modelInput), id = randomUUID()
  await rows('INSERT INTO models (id,name,source,reference,family) VALUES (?,?,?,?,?)', [id,data.name,data.source,data.reference,data.family])
  return { id }
})
