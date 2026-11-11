import { describe, expect, test } from 'bun:test'
import { datasetInput, defaults, eventInput, runInput } from '../shared/validation'

describe('Training input boundaries', () => {
  test('rejects unsupported dataset recipes instead of pretending all Hub datasets work', () => {
    expect(datasetInput.safeParse({ name: 'Other corpus', source: 'huggingface', reference: 'other/corpus', config: 'ta_in' }).success).toBe(false)
    expect(datasetInput.safeParse({ name: 'Tamil FLEURS', source: 'huggingface', reference: 'google/fleurs', config: 'en_us' }).success).toBe(false)
    expect(datasetInput.parse({ name: 'Tamil FLEURS', source: 'huggingface', reference: 'google/fleurs' }).labelOrigin).toBe('unknown')
  })
  test('rejects nonfinite and unsafe training parameters', () => {
    const run = { name: 'Baseline', modelId: crypto.randomUUID(), datasetId: crypto.randomUUID(), serverId: crypto.randomUUID(), config: defaults }
    expect(runInput.safeParse(run).success).toBe(true)
    for (const config of [{ lr: Infinity }, { batch: 0 }, { accum: -2 }, { workers: 999 }, { evalFrac: 1 }]) {
      expect(runInput.safeParse({ ...run, config: { ...defaults, ...config } }).success).toBe(false)
    }
  })
  test('limits worker event sizes', () => {
    const event = { id: crypto.randomUUID(), kind: 'log', step: null, payload: { message: 'x'.repeat(17000) } }
    expect(eventInput.safeParse({ events: [event] }).success).toBe(false)
  })
})
