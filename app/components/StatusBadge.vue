<script setup lang="ts">defineProps<{ status: string }>()</script>
<template><span class="badge" :class="status"><span class="status-dot" />{{ status.replaceAll('_', ' ') }}</span></template>
