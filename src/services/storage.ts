import { rotatePilotSession } from './pilotSession'
import { emptyResponse, type Draft } from '../types/profile'
const key = 'mirror:igor:v2'
function hasMirrorInterest(): boolean {
  try { return localStorage.getItem('create_mirror_interest') === 'true' } catch { return false }
}
export function freshDraft(): Draft { return { version: 2, screen: 0, journeyIndex: 0, rewardOpened: false, response: { ...emptyResponse(), createMirrorInterest: hasMirrorInterest() } } }
export function loadResponse(): Draft {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || 'null')
    if (!raw || typeof raw !== 'object') return freshDraft()
    const d = raw as Draft
    if (d.version !== 2 || !Number.isInteger(d.screen) || d.screen < 0 || d.screen > 14 || !d.response) return freshDraft()
    const response = { ...emptyResponse(), ...d.response, createMirrorInterest: hasMirrorInterest() || d.response.createMirrorInterest === true }
    for (const k of ['strengths', 'potential', 'risks', 'trustSituations'] as const) if (!Array.isArray(response[k]) || !response[k].every(v => typeof v === 'string')) return freshDraft()
    return { ...freshDraft(), ...d, response }
  } catch { return freshDraft() }
}
export function saveResponse(draft: Draft): boolean {
  try { localStorage.setItem(key, JSON.stringify(draft)); return true } catch { return false }
}
export function resetResponse() { try { localStorage.removeItem(key) } catch { /* Storage may be unavailable. */ } rotatePilotSession() }
export function saveMirrorInterest() { try { localStorage.setItem('create_mirror_interest', 'true') } catch { /* In-memory confirmation still works. */ } }

// Consume the reset flag before React mounts: keep other parameters and the hash.
export function initializeResponse(): Draft {
  const url = new URL(window.location.href)
  if (url.searchParams.getAll('reset').includes('1')) {
    resetResponse()
    url.searchParams.delete('reset')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    return freshDraft()
  }
  return loadResponse()
}
