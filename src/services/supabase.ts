import { createClient } from '@supabase/supabase-js'
let warned = false
export function remoteUnavailable() {
  if (import.meta.env.DEV && !warned) { console.warn('Remote analytics unavailable — using local fallback.'); warned = true }
}
function isServiceKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  try { const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return payload.role === 'service_role' } catch { return false }
}
const url = import.meta.env.VITE_SUPABASE_URL?.trim(), anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const supabase = (() => {
  if (!url || !anonKey || isServiceKey(anonKey)) { remoteUnavailable(); return null }
  try {
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000)
        try { return await fetch(input, { ...init, signal: controller.signal }) } finally { clearTimeout(timer) }
      } },
    })
  } catch { remoteUnavailable(); return null }
})()
