import type { Profile, ResponseState } from '../types/profile'

export interface ResultNarrative {
  title: string
  paragraphs: string[]
  cardParagraphs: string[]
  trustScore: number
  openAnswer: string
}
export function joinNatural(values: string[]): string {
  if (values.length < 2) return values[0] || ''
  return `${values.slice(0, -1).join(', ')} и ${values.at(-1)}`
}
function shorten(value: string, length = 70) {
  const text = value.trim()
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text
}
// Hand-authored grammatical forms live in the profile. Unknown future options
// stay as an exact quoted answer; no automatic Russian declension or inference.
export function buildResultNarrative(profile: Profile, response: ResponseState): ResultNarrative {
  const r = response, forms = profile.narrative
  const quoted = (value: string) => `«${value}»`
  const mapped = (values: string[], dictionary: Record<string, string>) => values.map(v => dictionary[v] || quoted(v))
  const strengths = joinNatural(mapped(r.strengths, forms.strengths))
  const potential = r.potential.includes(forms.neutralPotential)
    ? 'скрытого потенциала в предложенных направлениях ты не видишь'
    : r.potential.length ? `ты видишь в нём потенциал для ${joinNatural(mapped(r.potential, forms.potential))}` : ''
  const blind = r.blindSpot === forms.neutralBlindSpot
    ? 'считаешь, что он оценивает себя адекватно'
    : r.blindSpot === 'Свой вариант'
      ? r.blindSpotOther.trim() ? `то, что он недооценивает, ты описываешь так: ${quoted(r.blindSpotOther.trim())}` : ''
      : r.blindSpot ? `считаешь, что он недооценивает ${forms.blindSpot[r.blindSpot] || quoted(r.blindSpot)}` : ''
  const first = [strengths ? `Сильнее всего в нём для тебя проявляются ${strengths}` : '', potential, blind].filter(Boolean).join('; ')
  const riskSentence = (compact: boolean) => {
    if (r.risks.includes(forms.neutralRisk)) return 'При этом серьёзной проблемы, которая мешала бы ему двигаться дальше, ты не видишь.'
    if (!r.risks.length) return ''
    const risks = r.risks.map(v => v === 'Свой вариант' ? quoted(compact ? shorten(r.riskOther) : r.riskOther.trim()) : forms.risks[v] || quoted(v))
    return `На твой взгляд, двигаться дальше ему ${risks.length > 1 ? 'могут мешать' : 'может мешать'} ${joinNatural(risks)}.`
  }
  const role = r.projectRole === forms.noProject
    ? 'Совместный проект с ним ты бы не запускал'
    : r.projectRole ? `В совместном проекте ты доверил бы ему ${forms.projectRole[r.projectRole] || quoted(r.projectRole)}` : ''
  const trust = r.trustSituations.includes(forms.noCall)
    ? 'в сложной ситуации ты не стал бы ему звонить'
    : r.trustSituations.length ? `в сложной ситуации ты обратился бы к нему за ${joinNatural(mapped(r.trustSituations, forms.trustSituations))}` : ''
  const third = [role, trust].filter(Boolean).join('; ')
  const paragraphs = [first && `${first}.`, riskSentence(false), third && `${third}.`].filter(Boolean)
  // The Stories card uses its own shorter template; never invents an unselected quality.
  const cardStrengths = strengths ? `Для тебя его сильные стороны — ${strengths}.` : ''
  const cardPotential = r.potential.includes(forms.neutralPotential)
    ? 'Скрытого потенциала в предложенных направлениях ты не видишь.'
    : r.potential.length ? `Ты видишь потенциал для ${joinNatural(mapped(r.potential, forms.potential))}.` : ''
  const cardBlind = r.blindSpot === forms.neutralBlindSpot
    ? 'Он оценивает себя адекватно, на твой взгляд.'
    : r.blindSpot === 'Свой вариант'
      ? r.blindSpotOther.trim() ? `Твоё наблюдение: ${quoted(shorten(r.blindSpotOther))}.` : ''
      : r.blindSpot ? `Пока он недооценивает ${forms.blindSpot[r.blindSpot] || quoted(r.blindSpot)}.` : ''
  const title = r.strengths.map(strength => forms.summary.byStrength[strength]).find(Boolean) || forms.summary.fallback
  return { title, paragraphs, cardParagraphs: [cardStrengths, cardPotential, cardBlind, riskSentence(true)].filter(Boolean), trustScore: r.trustScore, openAnswer: r.openAnswer.trim() }
}
