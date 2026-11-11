export default defineEventHandler(event => { deleteCookie(event, 'forgelabs_session', { path: '/' }); return { ok: true } })
