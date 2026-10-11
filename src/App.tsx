import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'
import { igor } from './data/profiles/igor'
import { copy, questions, specialOptions as special } from './data/copy'
import { Choices, Score } from './components/Choices'
import { ResultActions } from './components/ResultActions'
import { freshDraft, initializeResponse, resetResponse, saveMirrorInterest, saveResponse } from './services/storage'
import { track, type AnalyticsEvent } from './services/analytics'
import { platform } from './services/platform'
import { buildResultNarrative } from './services/resultNarrative'
import { useResultCard } from './hooks/useResultCard'
import type { ResponseState } from './types/profile'

const journey = igor.journey || []
const hasBio = igor.bioEnabled && !!igor.bioCards?.length
const hasJourney = igor.bioEnabled && journey.length > 0
export default function App() {
  const [draft, setDraft] = useState(initializeResponse)
  const [storageOK, setStorageOK] = useState(true)
  const [assembling, setAssembling] = useState(draft.screen === 12)
  const [assemblyStep, setAssemblyStep] = useState(0)
  const [coverMissing, setCoverMissing] = useState(false)
  const [rewardOpening, setRewardOpening] = useState(false)
  const reduced = useReducedMotion()
  const heading = useRef<HTMLDivElement>(null)
  const carousel = useRef<HTMLDivElement>(null)
  const openingTimer = useRef<number | undefined>(undefined)
  const { screen, response: r } = draft
  const journeyRestore = useRef(draft.journeyIndex)
  const result = buildResultNarrative(igor, r)
  const resultCard = useResultCard(igor, r, screen >= 12)

  useEffect(() => {
    if (screen !== 2) { journeyRestore.current = draft.journeyIndex; return }
    const timer = window.setTimeout(() => {
      const el = carousel.current
      if (el) el.scrollLeft = Math.min(journeyRestore.current, journey.length - 1) * el.clientWidth
    }, reduced ? 0 : 320)
    return () => clearTimeout(timer)
  }, [screen, reduced])
  useEffect(() => { track('app_opened'); return () => clearTimeout(openingTimer.current) }, [])
  useEffect(() => { setStorageOK(saveResponse(draft)) }, [draft])
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [screen])
  useEffect(() => {
    if (screen !== 12) return
    setAssemblyStep(0); setAssembling(true)
    const interval = window.setInterval(() => setAssemblyStep(v => v + 1), 500)
    const timer = window.setTimeout(() => {
      setAssembling(false); track('result_viewed'); track('result_narrative_viewed')
    }, reduced ? 0 : 2500)
    return () => { clearInterval(interval); clearTimeout(timer) }
  }, [screen, reduced])
  const update = <K extends keyof ResponseState>(key: K, value: ResponseState[K]) => setDraft(d => ({ ...d, response: { ...d.response, [key]: value } }))
  function next(event?: AnalyticsEvent) {
    if (event) track(event)
    platform.haptic()
    setDraft(d => {
      let destination = Math.min(d.screen + 1, 14)
      if (destination === 1 && !hasBio) destination = hasJourney ? 2 : 3
      if (destination === 2 && !hasJourney) destination = 3
      return { ...d, screen: destination, response: { ...d.response, startedAt: d.response.startedAt || new Date().toISOString(), completedAt: d.screen === 11 ? new Date().toISOString() : d.response.completedAt } }
    })
  }
  function restartSurvey() {
    clearTimeout(openingTimer.current)
    resetResponse()
    setDraft(freshDraft())
    setRewardOpening(false)
    setAssembling(false)
    setAssemblyStep(0)
  }
  function back() {
    setDraft(d => {
      let destination = d.screen - 1
      if (destination === 2 && !hasJourney) destination = hasBio ? 1 : 0
      if (destination === 1 && !hasBio) destination = 0
      return { ...d, screen: destination }
    })
  }
  const otherInput = (key: 'relationshipOther' | 'blindSpotOther' | 'riskOther', label: string) => (
    <label className="other-input">{label}<input autoFocus maxLength={120} value={r[key]} onChange={e => update(key, e.target.value)} placeholder={copy.questions.placeholder} /><span>{r[key].length} / 120</span></label>
  )
  const primary = (label: string, action: () => void, enabled = true) => (
    <button className="primary" disabled={!enabled} onClick={action}>{label}<span aria-hidden="true">→</span></button>
  )
  const footer = (label: string, action: () => void, enabled = true, caption?: string) => (
    <div className="footer">{caption && <p className="footer-caption">{caption}</p>}{primary(label, action, enabled)}</div>
  )
  function openReward() {
    if (rewardOpening) return
    platform.haptic(); setRewardOpening(true)
    openingTimer.current = window.setTimeout(() => {
      track('reward_opened'); setDraft(d => ({ ...d, rewardOpened: true })); setRewardOpening(false)
    }, reduced ? 0 : 650)
  }
  function renderQuestion() {
    const i = screen - 5, q = questions[i]
    let valid = false, content
    if (i === 0) {
      valid = r.strengths.length === 3
      content = <><div className="selection-count" aria-live="polite">{copy.questions.selected} {r.strengths.length} {copy.questions.outOf} 3</div><Choices options={igor.strengthOptions} selected={r.strengths} max={3} onChange={v => update('strengths', v)} /></>
    }
    if (i === 1) {
      valid = r.potential.length > 0
      content = <Choices options={igor.potentialOptions} selected={r.potential} max={2} exclusive={igor.narrative.neutralPotential} onChange={v => update('potential', v)} />
    }
    if (i === 2) {
      valid = !!r.blindSpot && (r.blindSpot !== special.other || !!r.blindSpotOther.trim())
      content = <><Choices options={igor.blindSpotOptions} selected={[r.blindSpot]} single onChange={v => update('blindSpot', v[0])} />{r.blindSpot === special.other && otherInput('blindSpotOther', copy.questions.other)}</>
    }
    if (i === 3) {
      valid = r.risks.length > 0 && (!r.risks.includes(special.other) || !!r.riskOther.trim())
      content = <><Choices options={igor.riskOptions} selected={r.risks} max={2} exclusive={igor.narrative.neutralRisk} onChange={v => update('risks', v)} />{r.risks.includes(special.other) && otherInput('riskOther', copy.questions.riskOther)}</>
    }
    if (i === 4) {
      valid = !!r.projectRole
      content = <Choices options={igor.projectRoleOptions} selected={[r.projectRole]} single onChange={v => update('projectRole', v[0])} />
    }
    if (i === 5) {
      valid = r.trustSituations.length > 0
      content = <><Score id="trust" value={r.trustScore} onChange={v => update('trustScore', v)} low={copy.questions.trustLow} high={copy.questions.trustHigh} /><h3>{copy.questions.trustQuestion}</h3><p className="hint">{copy.questions.trustHint}</p><Choices options={igor.trustSituationOptions} selected={r.trustSituations} max={2} exclusive={igor.narrative.noCall} onChange={v => update('trustSituations', v)} /></>
    }
    return <><div className="progress-label"><span>{copy.questions.progress}</span><span>{i + 1} / 6</span></div><div className="progress-track"><div style={{ width: `${(i + 1) / 6 * 100}%` }} /></div><p className="eyebrow">{q.eyebrow}</p><h1>{q.title}</h1><p className="question">{q.question}</p><p className="hint">{q.hint}</p>{content}{footer(i === 0 ? copy.questions.confirm : copy.next, () => next(`question_${i + 1}_completed` as AnalyticsEvent), valid)}</>
  }
  return <MotionConfig reducedMotion="user"><div className={`app ${screen === 0 ? 'cover-screen' : ''}`}>
    {screen === 0 && <><motion.img className="cover" src={coverMissing ? igor.coverFallback : igor.coverPhoto} alt={coverMissing ? '' : copy.intro.photoAlt} onError={() => setCoverMissing(true)} animate={reduced ? {} : { scale: [1, 1.035] }} transition={{ duration: 18, repeat: Infinity, repeatType: 'reverse' }} />{coverMissing && <span className="cover-fallback-caption">{copy.intro.fallback}</span>}</>}
    <header className="header"><div className="brand"><span className="brand-icon" aria-hidden="true">◐</span>{copy.brand}<span className="brand-dot">/</span><span className="edition">{copy.edition}</span></div>{screen > 0 && screen < 12 && <button className="back" aria-label={copy.back} onClick={back}>←</button>}</header>
    {!storageOK && <p className="storage-warning" role="status">{copy.storageWarning}</p>}
    <AnimatePresence mode="wait"><motion.div key={screen} className={`screen screen-${screen}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .28 }} ref={heading} tabIndex={-1}>
      {screen === 0 && <><div className="intro-spacer" /><div className="intro-content"><p className="eyebrow">{copy.intro.eyebrow}</p><h1>{copy.intro.title}<br /><em>{copy.intro.nameQuestion}</em></h1><p className="intro-facts">{copy.intro.facts}</p><p className="intro-question">{copy.intro.question}</p><p className="meta"><span aria-hidden="true">◷</span>{copy.intro.meta}</p>{primary(copy.intro.start, () => next('started'))}<p className="intro-caption">{copy.intro.caption}</p><span className="bottom-number">{copy.intro.seal}</span></div></>}
      {screen === 1 && <><p className="eyebrow">{copy.context.eyebrow}</p><h1>{copy.context.title}<br /><em>{copy.context.emphasis}</em></h1><div className="bio-editorial">{igor.bioCards?.map((card, i) => <motion.div className={`bio-fact bio-fact-${i}`} key={card} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06 }}><span className="card-index">0{i + 1}</span><strong>{card}</strong></motion.div>)}</div><div className="context-notes"><div><span>{copy.context.specialization}</span><p title={igor.specialization}>{copy.context.specialtyShort}</p></div><div><span>{copy.context.experience}</span><p>{igor.experienceTags?.join(' · ')}</p></div></div><p className="context-transition">{copy.context.first}<br /><span>{copy.context.second}</span></p>{footer(copy.next, () => next())}</>}
      {screen === 2 && <><p className="eyebrow">{copy.journey.eyebrow}</p><h1>{copy.journey.title}</h1><p className="hint">{copy.journey.hint}</p><div className="journey" ref={carousel} onScroll={e => { const el = e.currentTarget; const index = Math.max(0, Math.min(Math.round(el.scrollLeft / el.clientWidth), journey.length - 1)); setDraft(d => d.journeyIndex === index ? d : { ...d, journeyIndex: index }) }}>{journey.map((card, i) => <article className={`journey-card chapter-${i}`} key={card.label}><div className="chapter-top"><span>{copy.journey.chapter} 0{i + 1}</span><span className="chapter-line" /></div><p className="eyebrow">{card.label}</p><h2>{card.title}</h2><p className="chapter-story">{card.text}</p>{card.closing && <p className="chapter-closing">{card.closing}</p>}<span className="chapter-watermark" aria-hidden="true">0{i + 1}</span></article>)}</div><div className="dots">{journey.map((_, i) => <button key={i} className={draft.journeyIndex === i ? 'active' : ''} aria-label={`${copy.journey.chapter} ${i + 1}`} aria-current={draft.journeyIndex === i ? 'step' : undefined} onClick={() => carousel.current?.scrollTo({ left: i * carousel.current.clientWidth, behavior: reduced ? 'instant' : 'smooth' })}><span /></button>)}</div>{footer(draft.journeyIndex === journey.length - 1 ? copy.journey.done : copy.journey.next, () => draft.journeyIndex === journey.length - 1 ? next('bio_completed') : carousel.current?.scrollTo({ left: (draft.journeyIndex + 1) * carousel.current.clientWidth, behavior: reduced ? 'instant' : 'smooth' }))}</>}
      {screen === 3 && <><div className="mirror-symbol" aria-hidden="true">◐</div><p className="why-text">{copy.why.first} <em>{copy.why.inside}</em></p><p className="story">{copy.why.second}</p><p className="story">{copy.why.third}</p><h1 className="why-end">{copy.why.title}<br /><em>{copy.why.emphasis}</em></h1>{footer(copy.why.cta, () => next())}</>}
      {screen === 4 && <><p className="eyebrow">{copy.calibration.eyebrow}</p><h1>{copy.calibration.question}</h1><Score id="familiarity" value={r.familiarityScore} onChange={v => update('familiarityScore', v)} low={copy.calibration.low} high={copy.calibration.high} /><h3>{copy.calibration.relationship}</h3><Choices options={igor.relationshipOptions} selected={[r.relationship]} single onChange={v => update('relationship', v[0])} />{r.relationship === special.otherRelationship && otherInput('relationshipOther', copy.calibration.otherLabel)}{footer(copy.next, () => next('calibration_completed'), !!r.relationship && (r.relationship !== special.otherRelationship || !!r.relationshipOther.trim()), copy.calibration.caption)}</>}
      {screen >= 5 && screen <= 10 && renderQuestion()}
      {screen === 11 && <><p className="eyebrow">{copy.open.eyebrow}</p><h1>{copy.open.title}<br /><em>{copy.open.emphasis}</em></h1><p className="hint">{copy.open.subtitle}</p><p className="question">{igor.finalOpenQuestion}</p><label className="open-answer"><span className="sr-only">{copy.open.label}</span><textarea maxLength={300} rows={6} placeholder={copy.open.placeholder} value={r.openAnswer} onChange={e => update('openAnswer', e.target.value)} /></label><p className="char-count">{r.openAnswer.length} / 300</p><p className="hint">{copy.open.hint}</p>{footer(copy.open.submit, () => next(r.openAnswer.trim() ? 'open_answer_completed' : 'open_answer_skipped'))}<button className="text-button" onClick={() => { update('openAnswer', ''); next('open_answer_skipped') }}>{copy.open.skip}</button></>}
      {screen === 12 && (assembling ? <div className="assembly" role="status"><div className="assembly-orbit" aria-hidden="true">◐</div><h1>{copy.result.assembling}<br /><em>{copy.result.assemblingEmphasis}</em></h1>{copy.result.steps.map((v, i) => <p className={assemblyStep > i ? 'done' : ''} key={v}>{v}<span>{assemblyStep > i ? '✓' : '·'}</span></p>)}</div> : <><p className="eyebrow">{copy.result.eyebrow}</p><h1>{copy.result.title}<br /><em>{copy.result.emphasis}</em></h1><article className="portrait"><div className="result-header"><span>{copy.result.personal}</span><span aria-hidden="true">◐</span></div><h2 className="portrait-title">{result.title}</h2><div className="portrait-narrative">{result.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div><div className="trust-result"><span>{copy.result.trust}</span><strong>{result.trustScore}<small> / 10</small></strong></div>{result.openAnswer && <blockquote><span>{copy.result.openAnswer}</span><p>{result.openAnswer}</p></blockquote>}<div className="result-seal">{copy.brand} / {new Date(r.completedAt || Date.now()).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</div></article><p className="hint result-caption">{copy.result.caption}</p><ResultActions {...resultCard} />{footer(copy.result.final, () => next())}</>)}
      {screen === 13 && <>{!draft.rewardOpened ? <><p className="eyebrow">{copy.reward.eyebrow}</p><h1>{copy.reward.title}</h1><p className="question preserve-lines">{copy.reward.question}</p><button className="capsule-button" aria-label={copy.reward.openLabel} disabled={rewardOpening} onClick={openReward}><motion.div className={`capsule ${rewardOpening ? 'capsule-opening' : ''}`} animate={reduced ? {} : rewardOpening ? { scale: 1.08, opacity: 0, y: -12 } : { y: [0, -8, 0] }} transition={rewardOpening ? { duration: .6 } : { duration: 4, repeat: Infinity }}><div className="capsule-inner">◐</div></motion.div><span role="status">{rewardOpening ? copy.reward.opening : copy.reward.instruction}</span></button></> : <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} className="reward-reveal"><div className="particles" aria-hidden="true">{[0,1,2,3,4].map(i => <motion.span key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: [0, 1, .25], y: -12 }} transition={{ duration: reduced ? 0 : 1.2, delay: reduced ? 0 : i * .07 }} />)}</div><p className="eyebrow">{copy.reward.reveal}</p><h1>{copy.reward.own}<br /><em>{copy.reward.mirror}</em></h1><p className="question preserve-lines">{copy.reward.questionAfter}</p><ol className="reward-steps">{copy.reward.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="hint">{copy.reward.hint}</p>{footer(copy.reward.create, () => next('create_mirror_clicked'))}<ResultActions {...resultCard} compact /><button className="text-button" onClick={() => setDraft(d => ({ ...d, screen: 12 }))}>{copy.reward.later}</button></motion.div>}</>}
      {screen === 14 && <><div className="mirror-symbol" aria-hidden="true">◐</div><p className="eyebrow">{copy.interest.eyebrow}</p><h1>{r.createMirrorInterest ? <>{copy.interest.done}<br /><em>{copy.interest.doneEmphasis}</em></> : <>{copy.interest.title}<br /><em>{copy.interest.emphasis}</em></>}</h1><p className="story">{r.createMirrorInterest ? copy.interest.confirmation : copy.interest.description}</p>{!r.createMirrorInterest && footer(copy.interest.cta, () => { saveMirrorInterest(); update('createMirrorInterest', true); platform.haptic() })}<ResultActions {...resultCard} compact /><button className="text-button" onClick={() => setDraft(d => ({ ...d, screen: 12 }))}>{copy.result.show}</button></>}
      {(screen === 14 || (screen === 13 && draft.rewardOpened)) && <button className="text-button" onClick={restartSurvey}>{copy.startAgain}</button>}
    </motion.div></AnimatePresence>
    {(import.meta.env.DEV || new URLSearchParams(window.location.search).has('prototype')) && <details className="dev-control"><summary>{copy.prototype}</summary><button onClick={() => { if (window.confirm(copy.restartConfirm)) { restartSurvey() } }}>{copy.restart}</button></details>}
  </div></MotionConfig>
}
