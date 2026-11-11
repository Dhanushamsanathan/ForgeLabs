<script setup lang="ts">
definePageMeta({ layout: false })
const password = ref(''), error = ref(''), busy = ref(false)
async function login() {
  busy.value = true; error.value = ''
  try { await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } }); await navigateTo('/') }
  catch (e) { error.value = apiError(e) } finally { busy.value = false }
}
</script>
<template><div class="login-page"><div class="login-decoration"><div class="brand"><span class="brand-mark">F<span /></span>ForgeLabs.</div><p class="eyebrow">THE MODEL WORKSPACE</p><h1>Build what<br>comes next.</h1><p>Your models, datasets, and compute.<br>One place to move them forward.</p><div class="login-grid" /></div><div class="login-main"><form class="login-form" @submit.prevent="login"><span class="eyebrow">WELCOME TO YOUR WORKSPACE</span><h1>Back to building.</h1><p>Sign in to manage your training infrastructure.</p><label class="field">Workspace password<input v-model="password" type="password" autocomplete="current-password" required autofocus placeholder="Enter your password" /></label><p v-if="error" class="alert error" role="alert">{{ error }}</p><button class="button primary full" :disabled="busy">{{ busy ? 'Signing in…' : 'Open workspace' }}<AppIcon name="ArrowRight" /></button><p class="form-hint">Use the operator password configured in your ForgeLabs environment.</p></form><span class="login-foot">Private workspace · Powered by your infrastructure</span></div></div></template>
