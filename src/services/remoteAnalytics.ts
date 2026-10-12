import { supabase, remoteUnavailable } from './supabase'
import { getPilotSession } from './pilotSession'
import type { ResponseState } from '../types/profile'
interface Task { id: string; rpc: 'mirror_ingest' | 'mirror_submit_lead'; args: Record<string, unknown> }
const queueKey = 'mirror:remote-outbox:v1'
let queue: Task[] = (() => { try { const value = JSON.parse(localStorage.getItem(queueKey) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } })()
let flushing = false, retryTimer: number | undefined
const feedbackWaiters = new Map<string, { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }>()
const leadWaiters = new Map<string, { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }>()
const confirmedLeads: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem('mirror:lead-confirmed:v1') || '{}') } catch { return {} } })()
export function getPendingLead(): string {
  return String(queue.find(task => task.rpc === 'mirror_submit_lead')?.args.p_telegram_username || '')
}
const confirmedFeedback = new Set<string>()
export function isFeedbackConfirmed(sessionId = getPilotSession().id): boolean {
  if (confirmedFeedback.has(sessionId)) return true
  try { return localStorage.getItem(`mirror:feedback-confirmed:${sessionId}`) === 'true' } catch { return false }
}
export function getPendingFeedback(): PilotFeedbackData | null {
  const task = queue.find(item => item.id === `feedback:${getPilotSession().id}`)
  const data = task?.args.p_feedback as { rating: number; create_own_intent: PilotFeedbackData['createOwnIntent']; comment: string } | undefined
  return data ? { rating: data.rating, createOwnIntent: data.create_own_intent, comment: data.comment } : null
}
function failFeedbackWaiters() {
  for (const waiter of feedbackWaiters.values()) waiter.reject(new Error('Feedback not confirmed'))
  feedbackWaiters.clear()
  for (const waiter of leadWaiters.values()) waiter.reject(new Error('Lead not confirmed'))
  leadWaiters.clear()
}

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
  if (!supabase) { failFeedbackWaiters(); return }
  if (flushing || !queue.length) return
  flushing = true
  try {
    while (queue.length) {
      const task = queue[0]
      const { error } = await supabase.rpc(task.rpc, task.args)
      if (error) throw error
      if (task.id.startsWith('feedback:')) {
        const sessionId = task.id.slice('feedback:'.length)
        confirmedFeedback.add(sessionId)
        try { localStorage.setItem(`mirror:feedback-confirmed:${sessionId}`, 'true') } catch { /* Memory receipt remains available. */ }
        feedbackWaiters.get(task.id)?.resolve()
        feedbackWaiters.delete(task.id)
      }
      if (task.rpc === 'mirror_submit_lead') {
        confirmedLeads[String(task.args.p_telegram_username)] = String(task.args.p_id)
        try { localStorage.setItem('mirror:lead-confirmed:v1', JSON.stringify(confirmedLeads)) } catch { /* Memory receipt remains available. */ }
        leadWaiters.get(task.id)?.resolve()
        leadWaiters.delete(task.id)
      }
      queue = queue.filter(item => item.id !== task.id); persist()
    }
  } catch {
    failFeedbackWaiters()
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
export function submitFeedback(data: PilotFeedbackData): Promise<void> {
  const sessionId = getPilotSession().id, id = `feedback:${sessionId}`
  if (isFeedbackConfirmed(sessionId)) return Promise.resolve()
  const existing = feedbackWaiters.get(id)
  if (existing) return existing.promise
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((onSuccess, onError) => { resolve = onSuccess; reject = onError })
  feedbackWaiters.set(id, { promise, resolve, reject })
  enqueue({ id, rpc: 'mirror_ingest', args: { ...sessionArgs(), p_feedback: { rating: data.rating, create_own_intent: data.createOwnIntent, comment: data.comment.trim() } } })
  // An existing failed task must also be flushed on an explicit retry.
  void flushRemoteAnalytics()
  return promise
}

export function registerSuccessfulShare(shareId: string) {
  enqueue({ id: `share:${shareId}`, rpc: 'mirror_ingest', args: { ...sessionArgs(), p_share_id: shareId } })
}
export function validTelegramUsername(value: string): boolean { return /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value.trim()) }
export function submitLead(username: string): Promise<void> {
  if (!validTelegramUsername(username)) return Promise.reject(new Error('Invalid Telegram username'))
  const name = username.trim().replace(/^@/, '')
  if (confirmedLeads[name]) return Promise.resolve()
  const pending = queue.find(task => task.rpc === 'mirror_submit_lead' && task.args.p_telegram_username === name)
  const id = pending ? String(pending.args.p_id) : crypto.randomUUID(), taskId = `lead:${id}`
  const existing = leadWaiters.get(taskId)
  if (existing) return existing.promise
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((onSuccess, onError) => { resolve = onSuccess; reject = onError })
  leadWaiters.set(taskId, { promise, resolve, reject })
  // No survey/session id, referral id, token or answers in the lead request.
  enqueue({ id: taskId, rpc: 'mirror_submit_lead', args: { p_id: id, p_telegram_username: name, p_source: 'pilot' } })
  void flushRemoteAnalytics()
  return promise
}
