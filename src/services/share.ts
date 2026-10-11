import { newShareLink } from './pilotSession'
import { registerSuccessfulShare } from './remoteAnalytics'
import { shareCopy } from '../data/copy'
import { track } from './analytics'
import { downloadResultCard, type ResultCard } from './resultCard'
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed'
export function canShareCard(card: ResultCard): boolean {
  try { return typeof navigator.share === 'function' && navigator.canShare?.({ files: [card.file] }) === true } catch { return false }
}
// Keep the share URL injectable for referral links and profile-specific URLs.
export function createSharePayload(card: ResultCard, url?: string): ShareData {
  return { files: [card.file], title: shareCopy.title, text: shareCopy.text, ...(url ? { url } : {}) }
}
export async function shareResultCard(card: ResultCard, url?: string): Promise<ShareOutcome> {
  track('result_share_clicked')
  if (!canShareCard(card)) { downloadResultCard(card); return 'downloaded' }
  try {
    // Card is pre-generated before the click to retain iOS user activation.
    const referral = newShareLink(url)
    await navigator.share(createSharePayload(card, referral.url)); registerSuccessfulShare(referral.shareId); track('result_share_success'); return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    track('result_share_failed'); return 'failed'
  }
}
export async function saveResultCard(card: ResultCard): Promise<ShareOutcome> {
  if (!canShareCard(card)) { downloadResultCard(card); return 'downloaded' }
  try {
    await navigator.share({ files: [card.file], title: shareCopy.title })
    // Indicates handing the card to the system; cannot inspect the Photos action.
    track('result_card_saved'); return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}
