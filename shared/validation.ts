import { z } from 'zod'
const name = z.string().trim().min(2).max(100)
const reference = z.string().trim().min(1).max(1000).refine(s => !/[\x00-\x1f]/.test(s), 'Invalid reference')
export const serverInput = z.object({ name, description: z.string().trim().max(500).default('') })
export const modelInput = z.object({ name, source: z.enum(['huggingface', 'local']), reference, family: z.literal('whisper').default('whisper') })
export const datasetInput = z.object({ name, source: z.enum(['huggingface', 'manifest']), reference, config: z.string().trim().max(100).default('ta_in'), labelOrigin: z.enum(['human', 'teacher', 'mixed', 'unknown']).default('unknown'), description: z.string().trim().max(1000).default('') }).superRefine((v, c) => {
  if (v.source === 'huggingface' && v.reference !== 'google/fleurs') c.addIssue({ code: 'custom', path: ['reference'], message: 'The first Hugging Face recipe supports google/fleurs. Use a prepared JSONL manifest for other datasets.' })
  if (v.source === 'huggingface' && v.config !== 'ta_in') c.addIssue({ code: 'custom', path: ['config'], message: 'The current stt-tamil recipe supports ta_in.' })
})
export const trainingConfig = z.object({
  epochs: z.number().min(0.1).max(100), batch: z.number().int().min(1).max(128),
  accum: z.number().int().min(1).max(128), lr: z.number().min(1e-7).max(0.01),
  rank: z.number().int().min(1).max(256), workers: z.number().int().min(0).max(64),
  evalFrac: z.number().min(0.05).max(0.4), seed: z.number().int().min(0).max(2147483647),
  resumeFrom: z.string().max(1000).default(''),
})
export const runInput = z.object({ name, serverId: z.string().uuid(), modelId: z.string().uuid(), datasetId: z.string().uuid(), config: trainingConfig })
export const eventInput = z.object({ events: z.array(z.object({ id: z.string().uuid(), kind: z.enum(['metric', 'log', 'checkpoint']), step: z.number().int().nonnegative().nullable().default(null), payload: z.record(z.unknown()).refine(x => JSON.stringify(x).length <= 16000, 'Event too large') })).max(100) })
export const defaults = { epochs: 3, batch: 4, accum: 4, lr: 0.0001, rank: 32, workers: 4, evalFrac: 0.12, seed: 42, resumeFrom: '' }
