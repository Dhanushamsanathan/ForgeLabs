<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal())
</script>
<template><dialog ref="dialog" class="modal" aria-labelledby="modal-title" @cancel.prevent="emit('close')" @click="($event.target === dialog) && emit('close')"><div class="modal-inner"><header class="modal-header"><div><h2 id="modal-title">{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div><button class="icon-button" aria-label="Close dialog" @click="emit('close')"><AppIcon name="X" /></button></header><slot /></div></dialog></template>
