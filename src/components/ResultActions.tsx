import { useEffect, useRef, useState } from 'react'
import { copy } from '../data/copy'
import { downloadResultCard, type ResultCard } from '../services/resultCard'
import { saveResultCard, shareResultCard, type ShareOutcome } from '../services/share'
interface Props { card: ResultCard | null; error: boolean; retry: () => void; compact?: boolean }
export function ResultActions({ card, error, retry, compact }: Props) {
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (preview) dialog.current?.showModal(); else dialog.current?.close() }, [preview])
  const messages: Record<ShareOutcome, string> = { shared: copy.result.shared, downloaded: copy.result.downloaded, cancelled: copy.result.cancelled, failed: copy.result.shareFailed }
  async function act(action: 'save' | 'share') {
    if (!card || busy) return
    setBusy(true)
    const outcome = await (action === 'save' ? saveResultCard(card) : shareResultCard(card))
    setStatus(messages[outcome]); setBusy(false)
    if (outcome === 'downloaded') setPreview(true)
  }
  return <div className="result-actions">
    <div className={compact ? 'actions-stack' : 'actions-grid'}>
      <button className="secondary" disabled={!card || busy} onClick={() => act('save')}>{compact ? copy.reward.save : copy.result.save}</button>
      {!compact && <button className="secondary" disabled={!card || busy} onClick={() => act('share')}>{copy.result.share}<span aria-hidden="true"> ↑</span></button>}
    </div>
    {error ? <button className="text-button" onClick={retry}>{copy.result.failed}</button> : !card && <p className="action-status" role="status">{copy.result.generating}</p>}
    <p className="action-status" role="status" aria-live="polite">{status}</p>
    {!compact && <><p className="save-hint">{copy.result.saveHint}</p>{card && <button className="text-button card-preview-trigger" onClick={() => setPreview(true)}>{copy.result.preview} →</button>}</>}
    <dialog className="card-dialog" ref={dialog} onClose={() => setPreview(false)} aria-label={copy.result.preview}>
      <div className="dialog-header"><span>{copy.result.preview}</span><button className="back" aria-label={copy.result.close} onClick={() => setPreview(false)}>×</button></div>
      {card && <img src={card.url} width={1080} height={1920} alt={copy.result.preview} />}
      <button className="primary" onClick={() => { if (card) { downloadResultCard(card); setStatus(copy.result.downloaded) } }}>{copy.result.download}</button>
    </dialog>
  </div>
}
