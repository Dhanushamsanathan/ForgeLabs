import { z } from 'zod'

const line = z.string().trim().min(1).max(500).regex(/^[^\r\n\0]+$/)
export default defineEventHandler(async event => {
  const config = await input(event, z.object({
    id: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.enum(['ssh', 'direct']),
    url: z.string().url().max(500),
    host: z.string().regex(/^(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*@)?[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/).optional(),
    port: z.number().int().min(1).max(65535).default(22),
    repo: line, python: line.default('python3'),
    gpu: line.default('0'), data: line.optional(), models: line.optional(),
  }))
  const url = new URL(config.url)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (config.mode === 'ssh' ? !local || url.protocol !== 'http:' || !config.host : url.protocol !== 'https:')) {
    throw createError({ statusCode: 400, statusMessage: 'Use a local HTTP URL with SSH, or an HTTPS URL for a direct connection.' })
  }
  const [server] = await rows('SELECT tokenHash FROM servers WHERE id = ?', [config.id])
  if (!server || !equal(digest(config.token), server.tokenHash)) throw createError({ statusCode: 403, statusMessage: 'Invalid worker credentials' })
  const assets = useStorage('assets:worker')
  async function sourceFile(name: string) {
    const value = await assets.getItemRaw<string | Uint8Array>(name)
    if (!value) throw createError({ statusCode: 500, statusMessage: 'Connector package is unavailable' })
    return typeof value === 'string' ? value : new TextDecoder().decode(value)
  }
  const files: Record<string, string> = {}
  for (const name of ['agent.py', 'runner.py', 'recipe.py']) {
    files[name] = await sourceFile(name)
  }
  const launcher = await sourceFile('setup:connector.py')
  const bootstrap = await sourceFile('setup:install.py')
  const payload = Buffer.from(JSON.stringify({ ...config, files, bootstrap })).toString('base64')
  setHeader(event, 'Content-Type', 'text/x-python; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="forgelabs-connect-${config.id.slice(0, 8)}.py"`)
  return launcher.replace('__FORGELABS_PAYLOAD__', payload)
})
