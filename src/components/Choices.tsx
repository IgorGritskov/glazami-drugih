import { copy } from '../data/copy'
interface Props { options: string[]; selected: string[]; onChange: (value: string[]) => void; max?: number; exclusive?: string; single?: boolean }
export function Choices({ options, selected, onChange, max = 1, exclusive, single }: Props) {
  return <div className="choices">{options.map(option => {
    const active = selected.includes(option)
    const disabled = !single && !active && selected.length >= max && option !== exclusive && !selected.includes(exclusive || '')
    return <button key={option} type="button" aria-pressed={active} disabled={disabled} className={`choice ${option.length > 22 ? 'choice-wide' : ''} ${active ? 'selected' : ''}`} onClick={() => {
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
