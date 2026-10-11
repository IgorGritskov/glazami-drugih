import { getPilotSession } from './pilotSession'
import { sendRemoteEvent } from './remoteAnalytics'
export type AnalyticsEvent = 'app_opened' | 'started' | 'bio_completed' | 'calibration_completed' | `question_${1|2|3|4|5|6}_completed` | 'open_answer_completed' | 'open_answer_skipped' | 'result_viewed' | 'reward_opened' | 'create_mirror_clicked' | 'result_narrative_viewed' | 'result_card_generated' | 'result_card_saved' | 'result_share_clicked' | 'result_share_success' | 'result_share_failed' | 'pilot_feedback_viewed' | 'pilot_feedback_submitted' | 'lead_form_viewed' | 'lead_submitted' | 'referral_visit' | 'step_viewed'
export interface AnalyticsMetadata { step?: string; reason?: string; method?: string }
// Only these technical keys can leave the analytics abstraction. Never pass answers or contacts.
export function track(event: AnalyticsEvent, metadata?: AnalyticsMetadata) {
  try {
    const session = getPilotSession(), step = metadata?.step
    const clean = Object.fromEntries(Object.entries(metadata || {}).filter(([key, value]) => ['step', 'reason', 'method'].includes(key) && typeof value === 'string').map(([key, value]) => [key, value!.slice(0, 80)]))
    const once = !['step_viewed', 'result_share_clicked', 'result_share_success', 'result_share_failed', 'result_card_saved', 'result_card_generated'].includes(event)
    const marker = `mirror:event:${session.id}:${event}`
    try { if (once && localStorage.getItem(marker)) return } catch { /* Storage denial must not disable telemetry. */ }
    const entry = { id: crypto.randomUUID(), sessionId: session.id, event, at: new Date().toISOString(), step, metadata: clean }
    if (import.meta.env.DEV) console.info('[mirror]', entry)
    try {
      const old = JSON.parse(localStorage.getItem('mirror:analytics') || '[]')
      localStorage.setItem('mirror:analytics', JSON.stringify([...(Array.isArray(old) ? old : []), entry].slice(-200)))
      if (once) localStorage.setItem(marker, 'true')
    } catch { /* The outbox also has a memory fallback. */ }
    sendRemoteEvent(entry)
  } catch { /* Telemetry must never interrupt the UI, including storage denial. */ }
}
export function trackSessionOpened() {
  track('app_opened')
  if (getPilotSession().referredBy) track('referral_visit')
}
