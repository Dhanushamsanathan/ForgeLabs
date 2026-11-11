export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    databaseUrl: '',
    sessionSecret: '',
    operatorPassword: '',
    public: { appName: 'ForgeLabs' },
  },
  app: { head: {
    title: 'ForgeLabs · Training workspace',
    meta: [{ name: 'description', content: 'Your models. Your infrastructure. One training workspace.' }],
    link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  } },
  nitro: { preset: 'bun' },
  typescript: { strict: true },
})
