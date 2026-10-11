export type AnalyticsEvent = 'app_opened' | 'started' | 'bio_completed' | 'calibration_completed' | `question_${1|2|3|4|5|6}_completed` | 'open_answer_completed' | 'open_answer_skipped' | 'result_viewed' | 'reward_opened' | 'create_mirror_clicked' | 'result_narrative_viewed' | 'result_card_generated' | 'result_card_saved' | 'result_share_clicked' | 'result_share_success' | 'result_share_failed'
export function track(event: AnalyticsEvent) {
  const entry = { event, at: new Date().toISOString() }
  if (import.meta.env.DEV) console.info('[mirror]', entry)
  try {
    const old = JSON.parse(localStorage.getItem('mirror:analytics') || '[]')
    localStorage.setItem('mirror:analytics', JSON.stringify([...(Array.isArray(old) ? old : []), entry].slice(-200)))
  } catch { /* Analytics must never block the experience. */ }
}
