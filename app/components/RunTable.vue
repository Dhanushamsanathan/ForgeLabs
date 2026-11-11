<script setup lang="ts">
import type { Run } from '#shared/types'
defineProps<{ runs: Run[] }>()
</script>
<template><div class="table-scroll"><table><thead><tr><th>Experiment</th><th>Status</th><th>Base model</th><th>Compute</th><th>Created</th><th><span class="sr-only">Open</span></th></tr></thead><tbody><tr v-for="run in runs" :key="run.id"><td><NuxtLink :to="`/runs/${run.id}`" class="table-title"><span class="table-icon"><AppIcon name="FlaskConical" :size="17" /></span><span>{{ run.name }}<small>{{ run.snapshot.dataset.name }}</small></span></NuxtLink></td><td><StatusBadge :status="run.status" /></td><td><span class="mono subtle">{{ run.snapshot.model.name }}</span></td><td class="subtle">{{ run.snapshot.serverName }}</td><td class="subtle nowrap">{{ ago(run.createdAt) }}</td><td><NuxtLink :to="`/runs/${run.id}`" class="icon-button" :aria-label="`Open ${run.name}`"><AppIcon name="ArrowUpRight" :size="16" /></NuxtLink></td></tr></tbody></table></div></template>
