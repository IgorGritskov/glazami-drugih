import { useEffect, useState } from 'react'
import { pilotCopy } from '../data/copy'
import { getPilotSession } from '../services/pilotSession'
import { submitFeedback, submitLead, validTelegramUsername } from '../services/remoteAnalytics'
import { track } from '../services/analytics'
interface FeedbackDraft { phase: 'closed' | 'feedback' | 'lead' | 'done'; rating: number; intent: 'yes' | 'maybe' | 'no' | ''; comment: string; contactSaved: boolean }
export function PilotFeedback({ expanded = false }: { expanded?: boolean }) {
  const session = getPilotSession(), key = `mirror:pilot-feedback:${session.id}`
  const [draft, setDraft] = useState<FeedbackDraft>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved && ['closed','feedback','lead','done'].includes(saved.phase)) return saved } catch { /* Local fallback. */ }
    return { phase: expanded ? 'feedback' : 'closed', rating: 0, intent: '', comment: '', contactSaved: false }
  })
  const [username, setUsername] = useState('')
  useEffect(() => { if (expanded && draft.phase === 'closed') setDraft(d => ({ ...d, phase: 'feedback' })) }, [expanded, draft.phase])
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(draft)) } catch { /* UI still works. */ }
    if (draft.phase === 'feedback') track('pilot_feedback_viewed', { step: 'pilot_feedback' })
    if (draft.phase === 'lead') track('lead_form_viewed', { step: 'lead_form' })
  }, [draft, key])
  if (draft.phase === 'closed') return <button className="text-button" onClick={() => setDraft(d => ({ ...d, phase: 'feedback' }))}>{pilotCopy.entry}</button>
  if (draft.phase === 'done') return <section className="pilot-feedback"><h2>{pilotCopy.thanks}</h2><p className="hint" role="status">{draft.contactSaved ? pilotCopy.contactSaved : draft.rating ? pilotCopy.saved : pilotCopy.optional}</p></section>
  if (draft.phase === 'lead') return <section className="pilot-feedback"><h2>{pilotCopy.leadTitle}</h2><p className="question">{pilotCopy.leadText}</p><label className="other-input">{pilotCopy.leadLabel}<input value={username} onChange={e => setUsername(e.target.value)} placeholder={pilotCopy.leadPlaceholder} maxLength={33} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label><p className="hint">{pilotCopy.leadHint}</p><p className="hint preserve-lines">{pilotCopy.privacy}</p><button className="primary" disabled={!validTelegramUsername(username)} onClick={() => { if (submitLead(username)) { track('lead_submitted'); setUsername(''); setDraft(d => ({ ...d, phase: 'done', contactSaved: true })) } }}>{pilotCopy.leadSubmit}</button><button className="text-button" onClick={() => setDraft(d => ({ ...d, phase: 'done' }))}>{pilotCopy.later}</button></section>
  return <section className="pilot-feedback" aria-label={pilotCopy.optional}>
    <h2>{pilotCopy.title}</h2><p className="hint preserve-lines">{pilotCopy.intro}</p>
    <h3>{pilotCopy.rating}</h3><div className="pilot-rating" role="group" aria-label={pilotCopy.rating}>{[1,2,3,4,5].map(value => <button className={`choice ${draft.rating === value ? 'selected' : ''}`} aria-pressed={draft.rating === value} aria-label={`${value} из 5`} key={value} onClick={() => setDraft(d => ({ ...d, rating: value }))}>{value}</button>)}</div>
    <h3>{pilotCopy.intent}</h3><div className="choices">{pilotCopy.options.map(option => <button key={option.value} className={`choice ${draft.intent === option.value ? 'selected' : ''}`} aria-pressed={draft.intent === option.value} onClick={() => setDraft(d => ({ ...d, intent: option.value }))}>{option.label}</button>)}</div>
    <label className="other-input">{pilotCopy.comment}<textarea maxLength={300} rows={3} placeholder={pilotCopy.placeholder} value={draft.comment} onChange={e => setDraft(d => ({ ...d, comment: e.target.value }))} /></label><p className="char-count">{draft.comment.length} / 300</p>
    <button className="primary" disabled={!draft.rating || !draft.intent} onClick={() => { if (!draft.intent || !draft.rating) return; submitFeedback({ rating: draft.rating, createOwnIntent: draft.intent, comment: draft.comment }); track('pilot_feedback_submitted'); setDraft(d => ({ ...d, phase: d.intent === 'no' ? 'done' : 'lead' })) }}>{pilotCopy.submit}</button><button className="text-button" onClick={() => setDraft(d => ({ ...d, phase: 'done', rating: 0 }))}>{pilotCopy.skip}</button>
  </section>
}
