<script setup lang="ts">
import type { RunEvent } from '#shared/types'
const props = withDefaults(defineProps<{ events: RunEvent[]; metric?: string; title?: string }>(), { metric: 'loss', title: 'Training loss' })
const points = computed(() => props.events.filter(e => typeof e.payload[props.metric] === 'number' && Number.isFinite(e.payload[props.metric])).map(e => ({ x: e.step ?? 0, y: Number(e.payload[props.metric]) })))
const bounds = computed(() => {
  const ys = points.value.map(p => p.y), xs = points.value.map(p => p.x)
  const min = Math.min(...ys, 0), max = Math.max(...ys, 0.001)
  return { min, max, xMin: Math.min(...xs, 0), xMax: Math.max(...xs, 1) }
})
const coords = computed(() => points.value.map(p => ({ x: 48 + (p.x - bounds.value.xMin) / (bounds.value.xMax - bounds.value.xMin) * 580, y: 185 - (p.y - bounds.value.min) / (bounds.value.max - bounds.value.min) * 155 })))
const path = computed(() => coords.value.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '))
</script>
<template><section class="panel chart-panel"><div class="panel-heading"><h3>{{ title }}</h3><span class="mono subtle">{{ points.length ? points.at(-1)!.y.toFixed(4) : '—' }}</span></div><div v-if="!points.length" class="chart-empty"><AppIcon name="Activity" :size="26" /><p>Waiting for {{ metric.replaceAll('_', ' ') }} metrics</p><small>Measurements appear when the worker reports them.</small></div><svg v-else viewBox="0 0 650 220" class="metric-chart" role="img" :aria-label="`${title}: ${points.length} measurements, latest ${points.at(-1)!.y}`"><g v-for="i in 5" :key="i"><line x1="48" x2="628" :y1="30 + (i - 1) * 38.75" :y2="30 + (i - 1) * 38.75" stroke="#e9e9e4" stroke-dasharray="3 4" /><text x="38" :y="34 + (i - 1) * 38.75" text-anchor="end">{{ (bounds.max - (i - 1) / 4 * (bounds.max - bounds.min)).toFixed(2) }}</text></g><path :d="path" fill="none" stroke="#eb7449" stroke-width="2.5" stroke-linejoin="round" /><circle v-if="coords.length === 1" :cx="coords[0]!.x" :cy="coords[0]!.y" r="4" fill="#eb7449"/><text x="48" y="210">0</text><text x="628" y="210" text-anchor="end">Step {{ bounds.xMax }}</text></svg></section></template>
