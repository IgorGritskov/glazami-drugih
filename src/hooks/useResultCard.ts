import { useEffect, useState } from 'react'
import type { Profile, ResponseState } from '../types/profile'
import { generateResultCard, type ResultCard } from '../services/resultCard'
export function useResultCard(profile: Profile, response: ResponseState, enabled: boolean) {
  const [card, setCard] = useState<ResultCard | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const responseKey = JSON.stringify({ strengths: response.strengths, potential: response.potential, blindSpot: response.blindSpot, blindSpotOther: response.blindSpotOther, risks: response.risks, riskOther: response.riskOther, projectRole: response.projectRole, trustScore: response.trustScore, trustSituations: response.trustSituations, openAnswer: response.openAnswer })
  useEffect(() => {
    if (!enabled) return
    let active = true
    let generated: ResultCard | null = null
    setCard(null); setError(false)
    generateResultCard(profile, response).then(result => {
      generated = result
      if (active) setCard(result)
      else URL.revokeObjectURL(result.url)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; if (generated) URL.revokeObjectURL(generated.url) }
  }, [profile, responseKey, enabled, attempt])
  return { card, error, retry: () => setAttempt(v => v + 1) }
}
