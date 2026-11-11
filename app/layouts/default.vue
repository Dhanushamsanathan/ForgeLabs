<script setup lang="ts">
const route = useRoute()
const { data, error, refresh } = await useWorkspace()
const { notice } = useNotice()
const mobile = ref(false)
const nav = [
  { label: 'Overview', to: '/', icon: 'LayoutDashboard' },
  { label: 'Experiments', to: '/runs', icon: 'FlaskConical' },
  { label: 'Models', to: '/models', icon: 'Layers' },
  { label: 'Datasets', to: '/datasets', icon: 'Database' },
  { label: 'Compute', to: '/servers', icon: 'Server' },
]
const current = computed(() => route.path.startsWith('/settings') ? 'Settings' : nav.find(n => n.to !== '/' && route.path.startsWith(n.to))?.label || 'Overview')
const online = computed(() => data.value.servers.filter(isOnline).length)
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => { if (!document.hidden) refresh() }, 5000) })
onUnmounted(() => clearInterval(timer))
watch(() => route.path, () => { mobile.value = false })
async function logout() { await $fetch('/api/auth/logout', { method: 'POST' }); clearNuxtData('workspace'); await navigateTo('/login') }
</script>
<template><div class="app-shell"><button v-if="mobile" class="sidebar-scrim" aria-label="Close navigation" @click="mobile = false" /><aside class="sidebar" :class="{ expanded: mobile }"><NuxtLink to="/" class="brand"><span class="brand-mark">F<span /></span>ForgeLabs<span class="brand-period">.</span></NuxtLink><div class="workspace-switch"><div class="workspace-avatar">FL</div><div><strong>My workspace</strong><small>Personal workspace</small></div><AppIcon name="ChevronDown" :size="15" /></div><div class="nav-label">WORKSPACE</div><nav><NuxtLink v-for="item in nav" :key="item.to" :to="item.to" class="nav-item" :class="{ active: item.to === '/' ? route.path === '/' : route.path.startsWith(item.to) }"><AppIcon :name="item.icon" :size="19" />{{ item.label }}<span v-if="item.to === '/runs' && data.runs.filter(r => r.status === 'running').length" class="nav-count">{{ data.runs.filter(r => r.status === 'running').length }}</span></NuxtLink></nav><div class="sidebar-bottom"><div class="compute-mini"><span class="online-dot" :class="{ offline: !online }" /><span>{{ online ? `${online} worker${online > 1 ? 's' : ''} online` : 'No workers connected' }}</span><NuxtLink to="/servers" aria-label="Manage compute"><AppIcon name="ArrowUpRight" :size="15" /></NuxtLink></div><NuxtLink to="/settings" class="nav-item" :class="{ active: route.path === '/settings' }"><AppIcon name="Settings2" />Settings & setup</NuxtLink><button class="profile" @click="logout"><span class="profile-avatar">W</span><span><strong>Workspace operator</strong><small>Sign out</small></span><AppIcon name="LogOut" :size="16" /></button></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumbs"><button class="icon-button mobile-toggle" aria-label="Open navigation" @click="mobile = !mobile"><AppIcon name="Menu" /></button><span>Workspace</span><AppIcon name="ChevronRight" :size="13" /><strong>{{ current }}</strong></div><div class="topbar-right"><span class="version">EARLY ACCESS <span>v0.1</span></span><NuxtLink to="/settings" class="icon-button" aria-label="Setup guide"><AppIcon name="CircleHelp" /></NuxtLink><span class="topbar-avatar">FL</span></div></header><main class="page-content"><div v-if="error" class="alert error" role="alert"><AppIcon name="TriangleAlert" />{{ apiError(error) }}<button class="text-button" @click="refresh()">Retry</button></div><slot /></main><footer class="app-footer"><span><span class="tiny-mark">◈</span> ForgeLabs <span class="muted">/</span> Your infrastructure. Your possibilities.</span><span>Built to experiment.</span></footer></div><Transition name="toast"><div v-if="notice" class="toast" role="status"><AppIcon name="Check" />{{ notice }}</div></Transition></div></template>
