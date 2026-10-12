import { useLayoutEffect, useRef, useState } from 'react'
import { copy } from '../data/copy'
interface Props { options: string[]; selected: string[]; onChange: (value: string[]) => void; max?: number; exclusive?: string; single?: boolean }
export function Choices({ options, selected, onChange, max = 1, exclusive, single }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState<Set<string>>(() => new Set())
  useLayoutEffect(() => {
    const element = grid.current
    if (!element) return
    let disposed = false
    function measure() {
      if (disposed || !element) return
      const style = getComputedStyle(element)
      const columnWidth = (element.clientWidth - parseFloat(style.columnGap || '0')) / 2
      if (columnWidth <= 0) return
      const next = new Set<string>()
      // Measure actual wrapping with the same font, padding and border as a card.
      const probe = document.createElement('button')
      probe.className = 'choice'
      Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: `${columnWidth}px`, minHeight: '0', transform: 'none' })
      const label = document.createElement('span')
      label.style.width = '100%'
      label.style.minWidth = '0'
      label.style.overflowWrap = 'normal'
      probe.append(label); element.append(probe)
      const lineHeight = parseFloat(getComputedStyle(probe).lineHeight)
      for (const option of options) {
        label.textContent = option
        if (label.getBoundingClientRect().height > lineHeight * 2 + 1 || label.scrollWidth > label.clientWidth + 1) next.add(option)
      }
      probe.remove()
      setWide(previous => previous.size === next.size && [...next].every(option => previous.has(option)) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { disposed = true; observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure) }
  }, [options])
  return <div className="choices" ref={grid}>{options.map(option => {
    const active = selected.includes(option)
    const disabled = !single && !active && selected.length >= max && option !== exclusive && !selected.includes(exclusive || '')
    return <button key={option} type="button" aria-pressed={active} disabled={disabled} className={`choice ${wide.has(option) ? 'choice-wide' : ''} ${active ? 'selected' : ''}`} onClick={() => {
      if (single) onChange([option])
      else if (active) onChange(selected.filter(v => v !== option))
      else if (option === exclusive) onChange([option])
      else onChange([...selected.filter(v => v !== exclusive), option].slice(0, max))
    }}><span>{option}</span></button>
  })}</div>
}
export function Score({ id, value, onChange, low, high }: { id: string; value: number; onChange: (value: number) => void; low: string; high: string }) {
  return <div className="score"><output htmlFor={id}>{value}<span> / 10</span></output><input id={id} type="range" min="1" max="10" value={value} onChange={e => onChange(Number(e.target.value))} aria-label={id === 'familiarity' ? copy.calibration.question : copy.result.trust} /><div className="range-labels"><span>1 — {low}</span><span>10 — {high}</span></div></div>
}
