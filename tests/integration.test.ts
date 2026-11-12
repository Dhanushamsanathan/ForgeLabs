import { beforeAll, describe, expect, test } from 'bun:test'
import { defaults } from '../shared/validation'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const url = process.env.FORGELABS_TEST_URL
const suite = url ? describe : describe.skip
suite('MySQL-backed API and worker lifecycle', () => {
  let cookie = '', server: any, secondServer: any, model: any, dataset: any, run: any
  const request = async (path: string, body?: any, headers: Record<string,string> = {}) => fetch(`${url}${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const worker = (s = server) => ({ Authorization: `Bearer ${s.token}`, 'X-Worker-Id': s.id, Cookie: '' })
  beforeAll(async () => {
    const response = await request('/api/auth/login', { password: process.env.NUXT_OPERATOR_PASSWORD })
    expect(response.status).toBe(200)
    cookie = response.headers.get('set-cookie')!.split(';')[0]!
  })
  test('operator routes require a session and reject cross-origin writes', async () => {
    expect((await request('/api/overview', undefined, { Cookie: '' })).status).toBe(401)
    expect((await request('/api/servers', { name: 'Not created' }, { Origin: 'https://untrusted.example' })).status).toBe(403)
  })
  test('persists resources without returning worker secrets', async () => {
    server = await (await request('/api/servers', { name: 'Integration worker' })).json()
    secondServer = await (await request('/api/servers', { name: 'Another worker' })).json()
    model = await (await request('/api/models', { name: 'Whisper integration model', source: 'huggingface', reference: 'openai/whisper-large-v3' })).json()
    dataset = await (await request('/api/datasets', { name: 'Integration manifest', source: 'manifest', reference: '/datasets/manifest.jsonl', labelOrigin: 'teacher' })).json()
    const overview = await (await request('/api/overview')).json()
    expect(overview.servers.length).toBe(2)
    expect(overview.servers[0].tokenHash).toBeUndefined()
    expect(overview.servers[0].token).toBeUndefined()
    expect(overview.datasets[0].labelOrigin).toBe('teacher')
  })
  test('accepts telemetry only from the assigned worker credential', async () => {
    const telemetry = { hostname: 'integration', workerVersion: 'test', activeRunId: null, diskFreeGb: 100, recipes: ['tamil-whisper-manifest'], gpus: [] }
    expect((await request('/api/worker/heartbeat', telemetry, { ...worker(), Authorization: 'Bearer ' + '0'.repeat(64) })).status).toBe(401)
    expect((await request('/api/worker/heartbeat', telemetry, worker())).status).toBe(200)
  })
  test('atomically claims one job under concurrent polling', async () => {
    run = await (await request('/api/runs', { name: 'Lifecycle integration', serverId: server.id, modelId: model.id, datasetId: dataset.id, config: defaults })).json()
    const claims = await Promise.all([request('/api/worker/claim', {}, worker()), request('/api/worker/claim', {}, worker())])
    const results = await Promise.all(claims.map(r => r.json()))
    expect(results.filter(r => r.run).length).toBe(1)
    expect(results.find(r => r.run).run.id).toBe(run.id)
  })
  test('isolates runs between workers and deduplicates replayed events', async () => {
    const event = { id: crypto.randomUUID(), kind: 'metric', step: 10, payload: { loss: 1.2, eval_cer: .15, total_steps: 100, step: 10 } }
    expect((await request(`/api/worker/runs/${run.id}/events`, { events: [event] }, worker(secondServer))).status).toBe(404)
    expect((await request(`/api/worker/runs/${run.id}/events`, { events: [event] }, worker())).status).toBe(200)
    await request(`/api/worker/runs/${run.id}/events`, { events: [event] }, worker())
    const detail = await (await request(`/api/runs/${run.id}`)).json()
    expect(detail.metrics.length).toBe(1)
    expect(detail.run.snapshot.dataset.labelOrigin).toBe('teacher')
    expect(detail.run.status).toBe('running')
  })
  test('cancels cooperatively and completes idempotently', async () => {
    await request(`/api/runs/${run.id}/cancel`, {})
    const response = await (await request(`/api/worker/runs/${run.id}/events`, { events: [] }, worker())).json()
    expect(response.cancelRequested).toBe(true)
    const finish = { status: 'cancelled', artifacts: [{ name: 'checkpoint-10', path: '/test/checkpoint-10', kind: 'checkpoint' }] }
    await request(`/api/worker/runs/${run.id}/finish`, finish, worker())
    await request(`/api/worker/runs/${run.id}/finish`, finish, worker())
    const detail = await (await request(`/api/runs/${run.id}`)).json()
    expect(detail.run.status).toBe('cancelled')
    expect(detail.artifacts.length).toBe(1)
    const terminal = await (await request(`/api/worker/runs/${run.id}/events`, { events: [] }, worker())).json()
    expect(terminal.terminal).toBe(true)
  })
  test('a queued cancellation prevents worker execution', async () => {
    const queued = await (await request('/api/runs', { name: 'Cancelled before launch', serverId: server.id, modelId: model.id, datasetId: dataset.id, config: defaults })).json()
    await request(`/api/runs/${queued.id}/cancel`, {})
    expect((await (await request('/api/worker/claim', {}, worker())).json()).run).toBeNull()
    expect((await (await request(`/api/runs/${queued.id}`)).json()).run.status).toBe('cancelled')
  })
  test('real Python worker reports a preflight failure without loading a GPU model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forgelabs-worker-test-'))
    await mkdir(join(root, 'data'))
    const failed = await (await request('/api/runs', { name: 'Worker preflight integration', serverId: secondServer.id, modelId: model.id, datasetId: dataset.id, config: defaults })).json()
    const agent = Bun.spawn(['python3', resolve('worker/agent.py')], { env: { ...process.env, FORGELABS_URL: url!, FORGELABS_WORKER_ID: secondServer.id, FORGELABS_WORKER_TOKEN: secondServer.token, STT_REPO: join(root, 'missing-repo'), FORGELABS_DATA_ROOT: join(root, 'data'), FORGELABS_RUN_ROOT: join(root, 'runs') }, stdout: 'ignore', stderr: 'inherit' })
    try {
      let detail: any
      for (let i = 0; i < 60; i++) {
        detail = await (await request(`/api/runs/${failed.id}`)).json()
        if (detail.run.status === 'failed') break
        await Bun.sleep(200)
      }
      expect(detail.run.status).toBe('failed')
      expect(detail.run.error).toContain('Path must be inside configured root')
      expect(detail.logs.length).toBeGreaterThan(0)
    } finally { agent.kill(); await agent.exited; await rm(root, { recursive: true, force: true }) }
  }, 20000)
  test('private connector packages the worker and installs a real polling agent', async () => {
    const paired = await (await request('/api/servers', { name: 'Connector integration' })).json()
    const root = await mkdtemp(join(tmpdir(), 'forgelabs-connector-'))
    const repo = join(root, 'training folder')
    await mkdir(join(repo, 'scripts'), { recursive: true })
    await writeFile(join(repo, 'scripts/train_lora.py'), '# test fixture')
    await writeFile(join(repo, 'scripts/train_relabeled.py'), '# test fixture')
    const config = { ...paired, mode: 'ssh', url, host: 'test-worker', repo, python: 'python3', gpu: '0' }
    let agent: ReturnType<typeof Bun.spawn> | undefined
    try {
      expect((await request('/api/servers/connector', config, { Cookie: '' })).status).toBe(401)
      expect((await request('/api/servers/connector', { ...config, token: '0'.repeat(64) })).status).toBe(403)
      expect((await request('/api/servers/connector', { ...config, host: '-oProxyCommand=bad' })).status).toBe(400)
      const response = await request('/api/servers/connector', config)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      let source = await response.text()
      const encoded = source.match(/base64.b64decode\('([A-Za-z0-9+/=]+)'\)/)![1]!
      const payload = JSON.parse(Buffer.from(encoded, 'base64').toString())
      expect(Object.keys(payload.files).sort()).toEqual(['agent.py', 'recipe.py', 'runner.py'])
      // Exercise the same installer locally; actual SSH needs the user's server.
      payload.mode = 'direct'
      source = source.replace(encoded, Buffer.from(JSON.stringify(payload)).toString('base64'))
      const script = join(root, 'connect.py')
      await writeFile(script, source, { mode: 0o600 })
      agent = Bun.spawn([process.env.FORGELABS_TEST_PYTHON || 'python3', script], { env: { ...process.env, HOME: root }, stdout: 'ignore', stderr: 'inherit' })
      let connected = false
      for (let i = 0; i < 50; i++) {
        const overview = await (await request('/api/overview')).json()
        connected = overview.servers.some((s: any) => s.id === paired.id && s.lastSeen)
        if (connected) break
        await Bun.sleep(200)
      }
      expect(connected).toBe(true)
      expect(await Bun.file(join(root, '.local/share/forgelabs', paired.id, 'worker.env')).exists()).toBe(true)
    } finally {
      if (agent) { agent.kill(); await agent.exited }
      await rm(root, { recursive: true, force: true })
    }
  }, 20000)

})
