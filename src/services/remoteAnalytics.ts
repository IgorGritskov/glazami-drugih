import { supabase, remoteUnavailable } from './supabase'
import { getPilotSession } from './pilotSession'
import type { ResponseState } from '../types/profile'
interface Task { id: string; rpc: 'mirror_ingest' | 'mirror_submit_lead'; args: Record<string, unknown> }
const queueKey = 'mirror:remote-outbox:v1'
let queue: Task[] = (() => { try { const value = JSON.parse(localStorage.getItem(queueKey) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } })()
let flushing = false, retryTimer: number | undefined
function persist() { try { localStorage.setItem(queueKey, JSON.stringify(queue)) } catch { remoteUnavailable() } }
function enqueue(task: Task) {
  if (queue.some(item => item.id === task.id)) return
  queue.push(task); persist(); void flushRemoteAnalytics()
}
function sessionArgs() {
  const s = getPilotSession()
  return { p_session_id: s.id, p_write_token: s.writeToken, p_profile_id: s.profileId, p_created_at: s.createdAt, p_source: s.source, p_referred_by: s.referredBy }
}
export async function flushRemoteAnalytics() {
  if (!supabase || flushing || !queue.length) return
  flushing = true
  try {
    while (queue.length) {
      const task = queue[0]
      const { error } = await supabase.rpc(task.rpc, task.args)
      if (error) throw error
      queue = queue.filter(item => item.id !== task.id); persist()
    }
  } catch {
    remoteUnavailable()
    if (!retryTimer) retryTimer = window.setTimeout(() => { retryTimer = undefined; void flushRemoteAnalytics() }, 30000)
  } finally { flushing = false }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => void flushRemoteAnalytics())
export function sendRemoteEvent(event: { id: string; event: string; at: string; step?: string; metadata?: Record<string, string | number | boolean> }) {
  enqueue({ id: event.id, rpc: 'mirror_ingest', args: { ...sessionArgs(), p_events: [{ id: event.id, event_name: event.event, created_at: event.at, step: event.step || null, metadata: event.metadata || {} }] } })
}
export function submitResponse(response: ResponseState) {
  const s = getPilotSession(), marker = `mirror:response-queued:${s.id}`
  try { if (localStorage.getItem(marker)) return } catch { /* Server unique key is the final guard. */ }
  const data = { familiarity_score: response.familiarityScore, relationship: response.relationship, relationship_other: response.relationshipOther, strengths: response.strengths, potential: response.potential, blind_spot: response.blindSpot, blind_spot_other: response.blindSpotOther, risks: response.risks, risk_other: response.riskOther, project_role: response.projectRole, trust_score: response.trustScore, trust_situations: response.trustSituations, open_answer: response.openAnswer, started_at: response.startedAt, completed_at: response.completedAt }
  enqueue({ id: `response:${s.id}`, rpc: 'mirror_ingest', args: { ...sessionArgs(), p_response: data } })
  try { localStorage.setItem(marker, 'true') } catch { /* Server unique key prevents duplicate responses. */ }
}
export interface PilotFeedbackData { rating: number; createOwnIntent: 'yes' | 'maybe' | 'no'; comment: string }
export function submitFeedback(data: PilotFeedbackData) {
  enqueue({ id: `feedback:${getPilotSession().id}`, rpc: 'mirror_ingest', args: { ...sessionArgs(), p_feedback: { rating: data.rating, create_own_intent: data.createOwnIntent, comment: data.comment.trim() } } })
}
export function registerSuccessfulShare(shareId: string) {
  enqueue({ id: `share:${shareId}`, rpc: 'mirror_ingest', args: { ...sessionArgs(), p_share_id: shareId } })
}
export function validTelegramUsername(value: string): boolean { return /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value.trim()) }
export function submitLead(username: string) {
  if (!validTelegramUsername(username)) return false
  const id = crypto.randomUUID()
  // No survey/session id, referral id, token or answers in the lead request.
  enqueue({ id: `lead:${id}`, rpc: 'mirror_submit_lead', args: { p_id: id, p_telegram_username: username.trim().replace(/^@/, ''), p_source: 'pilot' } })
  return true
}
