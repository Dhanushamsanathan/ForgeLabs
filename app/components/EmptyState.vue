<script setup lang="ts">withDefaults(defineProps<{ icon?: string; title: string; description: string; compact?: boolean }>(), { icon: 'Box' })</script>
<template><div class="empty-state" :class="{ compact }"><span class="empty-icon"><AppIcon :name="icon" :size="25" /></span><h3>{{ title }}</h3><p>{{ description }}</p><slot /></div></template>
