export interface Server {
  id: string; name: string; description: string; createdAt: string; lastSeen: string | null;
  telemetry: { hostname?: string; gpus?: { name: string; memoryTotal: number; memoryUsed: number; utilization: number }[]; diskFreeGb?: number; workerVersion?: string; activeRunId?: string | null; recipes?: string[] } | null;
}
export interface Model { id: string; name: string; source: 'huggingface' | 'local'; reference: string; family: string; createdAt: string }
export interface Dataset { id: string; name: string; source: 'huggingface' | 'manifest'; reference: string; config: string; labelOrigin: 'human' | 'teacher' | 'mixed' | 'unknown'; description: string; createdAt: string }
export interface TrainingConfig { epochs: number; batch: number; accum: number; lr: number; rank: number; workers: number; evalFrac: number; seed: number; resumeFrom: string }
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface Run {
  id: string; name: string; serverId: string; modelId: string; datasetId: string;
  status: RunStatus; cancelRequested: boolean; config: TrainingConfig;
  snapshot: { model: Model; dataset: Dataset; serverName: string; recipe: string };
  createdAt: string; startedAt: string | null; finishedAt: string | null; error: string | null;
}
export interface RunEvent { id: string; runId: string; kind: 'metric' | 'log' | 'checkpoint'; step: number | null; payload: Record<string, any>; createdAt: string }
export interface Artifact { id: string; runId: string; name: string; path: string; kind: string; createdAt: string }
export interface Overview { servers: Server[]; models: Model[]; datasets: Dataset[]; runs: Run[] }
