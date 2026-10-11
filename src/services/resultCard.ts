import { shareCopy } from '../data/copy'
import type { Profile, ResponseState } from '../types/profile'
import { buildResultNarrative } from './resultNarrative'
import { track } from './analytics'

export interface ResultCard { blob: Blob; file: File; url: string }
const width = 1080, height = 1920
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const paragraph of text.split('\n')) {
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(word).width > maxWidth) {
        if (line) { lines.push(line); line = '' }
        for (const char of Array.from(word)) {
          if (ctx.measureText(line + char).width > maxWidth && line) { lines.push(line); line = '' }
          line += char
        }
      } else if (ctx.measureText(line ? `${line} ${word}` : word).width > maxWidth && line) {
        lines.push(line); line = word
      } else { line = line ? `${line} ${word}` : word }
    }
    if (line) lines.push(line)
    line = ''
  }
  return lines
}
function drawMirror(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save(); ctx.strokeStyle = '#D5B36A'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, radius - 5, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fillStyle = '#D5B36A'; ctx.fill()
  ctx.restore()
}
export async function generateResultCard(profile: Profile, response: ResponseState): Promise<ResultCard> {
  await document.fonts.ready
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  const result = buildResultNarrative(profile, response)
  ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#6c5b36'; ctx.lineWidth = 2; ctx.strokeRect(46, 46, width - 92, height - 92)
  drawMirror(ctx, 119, 145, 27)
  ctx.font = '600 28px Arial, sans-serif'; ctx.fillStyle = '#F5F2EA'; ctx.fillText(shareCopy.footer, 168, 154)
  ctx.font = '20px Arial, sans-serif'; ctx.fillStyle = '#999999'; ctx.fillText(shareCopy.edition, 96, 225)
  ctx.fillStyle = '#D5B36A'; ctx.font = '22px Arial, sans-serif'; ctx.fillText(shareCopy.eyebrow, 96, 340)
  ctx.fillStyle = '#F5F2EA'; ctx.font = '112px Georgia, serif'; ctx.fillText(profile.name, 88, 477)
  ctx.fillStyle = '#D5B36A'; ctx.font = 'italic 40px Georgia, serif'
  let y = 553
  for (const line of wrapText(ctx, result.title, 880)) { ctx.fillText(line, 96, y); y += 52 }
  const narrativeTop = y + 45, narrativeBottom = 1300, availableHeight = narrativeBottom - narrativeTop
  let size = 40, wrapped: string[][] = []
  for (; size >= 28; size -= 1) {
    ctx.font = `${size}px Arial, sans-serif`
    wrapped = result.cardParagraphs.map(p => wrapText(ctx, p, 888))
    if (wrapped.reduce((sum, lines) => sum + lines.length * size * 1.5 + 24, 0) <= availableHeight) break
  }
  ctx.fillStyle = '#E5E1D7'
  y = narrativeTop
  // A last line cap protects future content or unusually long custom answers.
  const lineHeight = Math.max(28, size) * 1.5
  for (const paragraph of wrapped) {
    for (const line of paragraph) {
      if (y + lineHeight > narrativeBottom) { ctx.fillText('…', 96, y); y = narrativeBottom + 1; break }
      ctx.fillText(line, 96, y); y += lineHeight
    }
    if (y > narrativeBottom) break
    y += 24
  }
  ctx.strokeStyle = '#393225'; ctx.beginPath(); ctx.moveTo(96, 1370); ctx.lineTo(984, 1370); ctx.stroke()
  ctx.font = '22px Arial, sans-serif'; ctx.fillStyle = '#999999'; ctx.fillText(shareCopy.trust, 96, 1440)
  ctx.fillStyle = '#D5B36A'; ctx.font = '90px Georgia, serif'; ctx.fillText(String(result.trustScore), 96, 1558)
  ctx.font = '32px Arial, sans-serif'; ctx.fillStyle = '#999999'; ctx.fillText('/ 10', 232, 1555)
  ctx.fillStyle = '#F5F2EA'; ctx.font = 'italic 45px Georgia, serif'
  shareCopy.cta.split('\n').forEach((line, i) => ctx.fillText(line, 96, 1710 + i * 57))
  ctx.fillStyle = '#D5B36A'; ctx.font = '18px Arial, sans-serif'; ctx.fillText(shareCopy.footer, 96, 1840)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG export failed')), 'image/png'))
  const file = new File([blob], `${profile.id}-mirror.png`, { type: 'image/png' })
  track('result_card_generated')
  return { blob, file, url: URL.createObjectURL(blob) }
}
export function downloadResultCard(card: ResultCard) {
  const a = document.createElement('a'); a.href = card.url; a.download = card.file.name
  document.body.appendChild(a); a.click(); a.remove()
  track('result_card_saved')
}
