import { useEffect, useRef, useState } from 'react'
import { pilotCopy } from '../data/copy'
import { getPilotSession } from '../services/pilotSession'
import { getPendingFeedback, isFeedbackConfirmed, submitFeedback, submitLead, validTelegramUsername } from '../services/remoteAnalytics'
import { track } from '../services/analytics'
import { saveMirrorInterest } from '../services/storage'
interface FeedbackDraft { phase: 'closed' | 'feedback' | 'lead' | 'done'; rating: number; intent: 'yes' | 'maybe' | 'no' | ''; comment: string; contactSaved: boolean }
export function PilotFeedback({ expanded = false }: { expanded?: boolean }) {
  const session = getPilotSession(), key = `mirror:pilot-feedback:${session.id}`
  const [draft, setDraft] = useState<FeedbackDraft>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved && ['closed','feedback','lead','done'].includes(saved.phase)) {
      const pending = getPendingFeedback()
      if (pending) return { ...saved, phase: 'feedback', rating: pending.rating, intent: pending.createOwnIntent, comment: pending.comment }
      return saved.rating && !isFeedbackConfirmed(session.id) ? { ...saved, phase: 'feedback' } : saved
    } } catch { /* Local fallback. */ }
    return { phase: expanded ? 'feedback' : 'closed', rating: 0, intent: '', comment: '', contactSaved: false }
  })
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const sendingRef = useRef(false)
  const locked = sending || !!getPendingFeedback()
  const wantsMirror = draft.intent === 'yes' || draft.intent === 'maybe'
  async function sendFeedback() {
    if (!draft.rating || !draft.intent || sendingRef.current) return
    sendingRef.current = true; setSending(true); setSendFailed(false)
    try {
      await submitFeedback({ rating: draft.rating, createOwnIntent: draft.intent, comment: draft.comment })
      track('pilot_feedback_submitted')
      if (wantsMirror) { saveMirrorInterest(); track('create_mirror_clicked') }
      setDraft(d => ({ ...d, phase: wantsMirror ? 'lead' : 'done' }))
    } catch { setSendFailed(true) }
    finally { sendingRef.current = false; setSending(false) }
  }
  const [username, setUsername] = useState('')
  useEffect(() => { if (expanded && draft.phase === 'closed') setDraft(d => ({ ...d, phase: 'feedback' })) }, [expanded, draft.phase])
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(draft)) } catch { /* UI still works. */ }
    if (draft.phase === 'feedback') track('pilot_feedback_viewed', { step: 'pilot_feedback' })
    if (draft.phase === 'lead') track('lead_form_viewed', { step: 'lead_form' })
  }, [draft, key])
  if (draft.phase === 'closed') return <button className="text-button" onClick={() => setDraft(d => ({ ...d, phase: 'feedback' }))}>{pilotCopy.entry}</button>
  if (draft.phase === 'done') return <section className="pilot-feedback"><h2>{pilotCopy.thanks}</h2><p className="hint" role="status">{draft.contactSaved ? pilotCopy.contactSaved : draft.rating && isFeedbackConfirmed(session.id) ? pilotCopy.saved : pilotCopy.optional}</p></section>
  if (draft.phase === 'lead') return <section className="pilot-feedback"><h2>{pilotCopy.leadTitle}</h2><p className="question">{pilotCopy.leadText}</p><label className="other-input">{pilotCopy.leadLabel}<input value={username} onChange={e => setUsername(e.target.value)} placeholder={pilotCopy.leadPlaceholder} maxLength={33} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label><p className="hint">{pilotCopy.leadHint}</p><p className="hint preserve-lines">{pilotCopy.privacy}</p><button className="primary" disabled={!validTelegramUsername(username)} onClick={() => { if (submitLead(username)) { track('lead_submitted'); setUsername(''); setDraft(d => ({ ...d, phase: 'done', contactSaved: true })) } }}>{pilotCopy.leadSubmit}</button><button className="text-button" onClick={() => setDraft(d => ({ ...d, phase: 'done' }))}>{pilotCopy.later}</button></section>
  return <section className={`pilot-feedback ${expanded ? 'pilot-feedback-final' : ''}`} aria-label={pilotCopy.optional}>
    {expanded ? <h1>{pilotCopy.title}</h1> : <h2>{pilotCopy.title}</h2>}<p className="hint preserve-lines">{pilotCopy.intro}</p>
    <h3 id="pilot-rating-label">{pilotCopy.rating}</h3><div className="pilot-rating" role="radiogroup" aria-labelledby="pilot-rating-label">{[1,2,3,4,5].map(value => <button className={`pilot-star ${draft.rating >= value ? 'filled' : ''}`} role="radio" aria-checked={draft.rating === value} aria-label={`${value} из 5 звёзд`} tabIndex={draft.rating === value || (!draft.rating && value === 1) ? 0 : -1} key={value} disabled={locked} onClick={() => setDraft(d => ({ ...d, rating: value }))} onKeyDown={e => {
      const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!delta && e.key !== 'Home' && e.key !== 'End') return
      e.preventDefault()
      const rating = e.key === 'Home' ? 1 : e.key === 'End' ? 5 : Math.max(1, Math.min(5, value + delta))
      setDraft(d => ({ ...d, rating }))
      ;(e.currentTarget.parentElement?.children[rating - 1] as HTMLButtonElement)?.focus()
    }}><span aria-hidden="true">{draft.rating >= value ? '★' : '☆'}</span></button>)}</div>
    <h3>{pilotCopy.intent}</h3><div className="choices">{pilotCopy.options.map(option => <button key={option.value} disabled={locked} className={`choice ${draft.intent === option.value ? 'selected' : ''}`} aria-pressed={draft.intent === option.value} onClick={() => setDraft(d => ({ ...d, intent: option.value }))}>{option.label}</button>)}</div>
    <label className="other-input">{pilotCopy.comment}<textarea disabled={locked} maxLength={300} rows={3} placeholder={pilotCopy.placeholder} value={draft.comment} onChange={e => setDraft(d => ({ ...d, comment: e.target.value }))} /></label><p className="char-count">{draft.comment.length} / 300</p>
    <p className="hint" role="status" aria-live="polite">{sending ? pilotCopy.sending : sendFailed || getPendingFeedback() ? pilotCopy.sendFailed : ''}</p>
    <button className="primary" disabled={sending || !draft.rating || !draft.intent} onClick={sendFeedback}>{sending ? pilotCopy.sending : sendFailed || getPendingFeedback() ? pilotCopy.retry : wantsMirror ? pilotCopy.create : pilotCopy.submit}<span aria-hidden="true">→</span></button><button className="text-button" disabled={locked} onClick={() => setDraft(d => ({ ...d, phase: 'done', rating: 0 }))}>{pilotCopy.skip}</button>
  </section>
}
