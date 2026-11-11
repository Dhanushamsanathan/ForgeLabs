import type { Overview, Server } from '../../shared/types'
export function useWorkspace() {
  const request = useRequestFetch()
  return useAsyncData<Overview>('workspace', () => request('/api/overview'), {
    server: false, default: () => ({ servers: [], models: [], datasets: [], runs: [] }),
  })
}
export const isOnline = (server: Server) => Boolean(server.lastSeen && Date.now() - new Date(server.lastSeen).getTime() < 45000)
export function ago(value: string | null) {
  if (!value) return 'Not connected yet'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
export const apiError = (error: any) => error?.data?.statusMessage || error?.message || 'Something went wrong. Please try again.'
export function useNotice() {
  const notice = useState('notice', () => '')
  function notify(message: string) { notice.value = message; setTimeout(() => { if (notice.value === message) notice.value = '' }, 5000) }
  return { notice, notify }
}
