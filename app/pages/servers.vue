<script setup lang="ts">
const { data, refresh } = await useWorkspace()
const modal = ref(false), busy = ref(false), error = ref('')
const form = reactive({ name: '', description: '' })
const credentials = ref<{ id: string; token: string } | null>(null)
const origin = ref('http://127.0.0.1:3100')
const setup = reactive({ mode: 'ssh' as 'ssh' | 'direct', host: '', port: 22, repo: '', python: 'python3', gpu: '0', data: '', models: '', url: '' })
const downloaded = ref(false)
onMounted(() => {
  origin.value = window.location.origin
  setup.url = origin.value
  setup.mode = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) ? 'ssh' : 'direct'
})
const connected = computed(() => credentials.value && data.value.servers.some(s => s.id === credentials.value!.id && isOnline(s)))
const filename = computed(() => `forgelabs-connect-${credentials.value?.id.slice(0, 8)}.py`)
const command = computed(() => setup.mode === 'ssh' ? `python3 ~/Downloads/${filename.value}` : `python3 ${filename.value}`)
async function save() {
  busy.value = true; error.value = ''
  try {
    if (!credentials.value) credentials.value = await $fetch<{ id: string; token: string }>('/api/servers', { method: 'POST', body: form })
    const source = await $fetch<string>('/api/servers/connector', { method: 'POST', body: {
      ...credentials.value, ...setup, host: setup.mode === 'ssh' ? setup.host : undefined,
      data: setup.data || undefined, models: setup.models || undefined,
    }, responseType: 'text' })
    const url = URL.createObjectURL(new Blob([source], { type: 'text/x-python' }))
    const link = document.createElement('a'); link.href = url; link.download = filename.value; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    downloaded.value = true
    await refresh()
  } catch (e) { error.value = apiError(e) } finally { busy.value = false }
}
async function copy() { try { await navigator.clipboard.writeText(command.value); useNotice().notify('Command copied') } catch { error.value = 'Select and copy the command below.' } }
function close() { modal.value = false; credentials.value = null; downloaded.value = false; form.name = ''; form.description = ''; error.value = '' }
</script>
<template><div class="page-heading"><div><span class="eyebrow">YOUR INFRASTRUCTURE</span><h1>Compute<span class="title-dot">.</span></h1><p>Bring your GPUs. Keep control of where training happens.</p></div><button class="button primary" @click="modal = true"><AppIcon name="Plus" />Connect server</button></div><div class="info-strip"><AppIcon name="Radio" /><span>Workers connect outward to ForgeLabs. No SSH credentials are stored in the application.</span></div><div v-if="data.servers.length" class="resource-grid"><article v-for="server in data.servers" :key="server.id" class="panel resource-card"><div class="resource-top"><span class="resource-icon"><AppIcon name="Server" :size="25" /></span><StatusBadge :status="isOnline(server) ? 'online' : server.lastSeen ? 'offline' : 'unpaired'" /></div><h2>{{ server.name }}</h2><p>{{ server.description || 'Dedicated training worker' }}</p><div class="hardware-list"><div v-for="(gpu, i) in server.telemetry?.gpus || []" :key="i"><span><AppIcon name="Cpu" :size="15" />{{ gpu.name }}</span><strong>{{ (gpu.memoryUsed / 1024).toFixed(1) }} / {{ (gpu.memoryTotal / 1024).toFixed(0) }} GB</strong><div class="meter"><span :style="{ width: `${Math.min(100, gpu.memoryUsed / Math.max(1, gpu.memoryTotal) * 100)}%` }" /></div><small>{{ gpu.utilization }}% utilization</small></div><div v-if="!server.telemetry?.gpus?.length" class="subtle">GPU inventory appears after the worker connects.</div></div><div class="resource-footer"><span>{{ ago(server.lastSeen) }}</span><span v-if="server.telemetry?.diskFreeGb !== undefined">{{ server.telemetry.diskFreeGb.toFixed(0) }} GB free</span></div><NuxtLink v-if="server.telemetry?.activeRunId" :to="`/runs/${server.telemetry.activeRunId}`" class="text-link">View active run<AppIcon name="ArrowUpRight" :size="15" /></NuxtLink></article></div><section v-else class="panel"><EmptyState icon="Server" title="A home for your training jobs" description="Connect a GPU server to see its hardware, availability, and running experiments."><button class="button secondary" @click="modal = true"><AppIcon name="Plus" :size="16" />Connect your first server</button></EmptyState></section><AppModal v-if="modal" :title="downloaded ? connected ? 'Server connected' : 'Run your connector' : 'Connect a GPU server'" :subtitle="downloaded ? 'Your connector includes everything needed to pair this worker.' : 'Use your existing SSH login and training environment.'" @close="close">
<template v-if="downloaded">
  <div class="alert" :class="connected ? 'info' : 'warning'" role="status"><AppIcon :name="connected ? 'Check' : 'Radio'" />{{ connected ? 'Connected. GPU information is available in Compute.' : 'Waiting for the server to connect…' }}</div>
  <p class="body-copy">{{ setup.mode === 'ssh' ? 'Run this command in a terminal on this computer. The connector sets up SSH forwarding and starts the worker on your GPU server.' : 'Copy the downloaded connector to your GPU server, activate its training environment, then run this command in the folder containing the file.' }}</p>
  <pre class="code-block">{{ command }}</pre>
  <p class="form-hint">Keep the terminal open. Run the same file again to reconnect. This file contains your worker credential; keep it private.</p>
  <p v-if="error" class="alert error" role="alert">{{ error }}</p>
  <div class="modal-actions"><button class="button secondary" @click="copy"><AppIcon name="Copy" :size="16" />Copy command</button><button class="button secondary" :disabled="busy" @click="save">Download again</button><button class="button primary" @click="close">Done</button></div>
</template>
<form v-else @submit.prevent="save">
  <label class="field">Server name<input v-model="form.name" required minlength="2" maxlength="100" placeholder="RTX 6000 workstation" :disabled="!!credentials" /></label>
  <label class="field">Connection method<select v-model="setup.mode"><option value="ssh">SSH from this computer</option><option value="direct">Direct to a hosted ForgeLabs</option></select></label>
  <label v-if="setup.mode === 'ssh'" class="field">SSH address<input v-model="setup.host" required pattern="(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*@)?[a-zA-Z0-9_][a-zA-Z0-9_.-]*" placeholder="user@gpu-server or SSH alias" /><small>Use the same address you use with ssh. Your SSH keys and login stay on your computer.</small></label>
  <label class="field">Training folder on server<input v-model="setup.repo" required placeholder="/home/you/stt-tamil" /><small>The existing stt-tamil checkout.</small></label>
  <details><summary class="text-link">Advanced settings</summary><div class="advanced-fields">
    <label v-if="setup.mode === 'ssh'" class="field">Python executable on server<input v-model="setup.python" required placeholder="/home/you/stt-tamil/.venv/bin/python" /><small>Choose the Python environment already used for training.</small></label>
    <label class="field">GPU to use<input v-model="setup.gpu" required placeholder="0" /><small>GPU index or UUID assigned to this worker.</small></label>
    <label v-if="setup.mode === 'ssh'" class="field">SSH port<input v-model.number="setup.port" type="number" min="1" max="65535" required /></label>
    <label class="field">ForgeLabs URL<input v-model="setup.url" type="url" required /><small>{{ setup.mode === 'ssh' ? 'Local HTTP address on this computer.' : 'HTTPS address reachable from the GPU server.' }}</small></label>
    <label class="field">Dataset folder<input v-model="setup.data" placeholder="Defaults to data inside your training folder" /></label>
    <label class="field">Local model folder<input v-model="setup.models" placeholder="Optional; needed for local models" /></label>
  </div></details>
  <p v-if="error" class="alert error" role="alert">{{ error }}</p>
  <p class="form-hint">Requires Python 3.10+ on the GPU server. Existing training dependencies are preserved.</p>
  <div class="modal-actions"><button type="button" class="button secondary" @click="close">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Preparing…' : 'Download connector' }}<AppIcon name="ArrowRight" :size="16" /></button></div>
</form></AppModal></template>
