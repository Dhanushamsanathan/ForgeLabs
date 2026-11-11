import { randomUUID } from 'node:crypto'
import { serverInput } from '../../../shared/validation'
export default defineEventHandler(async event => {
  const data = await input(event, serverInput)
  const id = randomUUID(), token = newToken()
  await rows('INSERT INTO servers (id,name,description,tokenHash) VALUES (?,?,?,?)', [id, data.name, data.description, digest(token)])
  return { id, token }
})
