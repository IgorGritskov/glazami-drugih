export interface PilotSession { id: string; writeToken: string; profileId: string; createdAt: string; source: string; referredBy: string | null }
const key = 'mirror:pilot-session:v1'
let current: PilotSession | null = null
function createSession(): PilotSession {
  const params = new URL(window.location.href).searchParams
  const source = params.get('src') || 'direct', ref = params.get('ref')
  return { id: crypto.randomUUID(), writeToken: crypto.randomUUID() + crypto.randomUUID(), profileId: 'igor', createdAt: new Date().toISOString(), source: ['telegram', 'whatsapp', 'direct', 'test'].includes(source) ? source : 'direct', referredBy: ref && /^[A-Za-z0-9_-]{1,100}$/.test(ref) ? ref : null }
}
export function getPilotSession(): PilotSession {
  if (current) return current
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null')
    if (stored && typeof stored.id === 'string' && /^[0-9a-f-]{36}$/i.test(stored.id) && typeof stored.writeToken === 'string' && stored.writeToken.length === 72) current = stored
  } catch { /* Private browsing can disable storage. */ }
  if (!current) current = createSession()
  try { localStorage.setItem(key, JSON.stringify(current)) } catch { /* Memory fallback. */ }
  return current!
}
export function rotatePilotSession() {
  const previous = getPilotSession()
  try { localStorage.removeItem(`mirror:pilot-feedback:${previous.id}`); localStorage.removeItem(key) } catch { /* Memory fallback. */ }
  current = null
  return getPilotSession()
}
export function newShareLink(base = window.location.href) {
  const shareId = crypto.randomUUID().replaceAll('-', '')
  const url = new URL(base)
  url.searchParams.delete('reset'); url.searchParams.delete('prototype'); url.searchParams.delete('src')
  url.searchParams.set('ref', shareId); url.hash = ''
  return { shareId, url: url.toString() }
}
