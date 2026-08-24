import { useState } from 'react'
import logo52g from '../assets/52g-logo.png'
import {
  ALLERGY_OPTIONS,
  TOTAL_TEAMS,
  MAX_MEMBER_COUNT,
  MEALS,
  MENUS,
  personDiet,
} from '../config.js'
import { normalizeTeam } from '../lib/storage.js'
import GuideSection from './GuideSection.jsx'

// 알러지 인원 블록의 React key 겸 식별자 생성 (사람별로 별개 목록을 구분하기 위함)
let blockSeq = 0
const newBlock = (list = []) => ({ id: `p${blockSeq++}`, list })

// 저장된 team.allergies를 사람 단위 블록으로 변환.
// 예전 형식(사람 구분 없는 문자열 배열)이 남아있어도 각 항목을 1인分으로 감싸서
// 화면이 깨지지 않도록 방어 (list.filter 등이 문자열에는 없어 크래시하는 걸 방지)
const toAllergyBlocks = (allergies) =>
  (allergies || []).map((p) => newBlock(Array.isArray(p) ? p : [p]))

// 한 사람의 알러지 선택 결과를 사람이 읽을 수 있는 안내로 바꿔 보여줌.
// 판정 자체는 config.personDiet 한 곳에서만 하므로 화면끼리 어긋나지 않습니다.
function DietSummary({ allergies }) {
  const { byMeal, needsAlt } = personDiet(allergies)
  const allAlt = needsAlt.length === MEALS.length
  return (
    <div className={`diet-summary${allAlt ? ' diet-alt' : ''}`}>
      {allAlt ? (
        <b>⚠️ 모든 메뉴에 해당 성분이 들어 있어 대체 메뉴가 필요합니다. 운영진이 따로 준비합니다.</b>
      ) : (
        MEALS.map((meal) => {
          const eatable = byMeal[meal.id]
          const total = (MENUS[meal.id] || []).length
          return (
            <p key={meal.id}>
              <span className="diet-meal">{meal.label}</span>
              {eatable.length === 0 ? (
                <b className="diet-none">먹을 수 있는 메뉴 없음 · 대체 메뉴 준비</b>
              ) : eatable.length === total ? (
                <span className="diet-ok">전체 메뉴 가능</span>
              ) : (
                <span className="diet-partial">
                  {eatable.map((m) => m.name.replace('\n', ' ')).join(', ')} 만 가능
                </span>
              )}
            </p>
          )
        })
      )}
    </div>
  )
}

// QR은 모든 팀이 공유 → 첫 진입 시 팀 정보를 직접 입력 (PRD 요청 #2)
// 팀 번호 / 인원수 / 알러지(인원별로 구분 입력 — 1명이 여러 개인지,
// 여러 명이 각각 하나씩인지에 따라 대체 메뉴 준비량이 달라지므로 사람 단위로 관리)
// ※ 계열사는 더 이상 참가자가 선택하지 않음 — 마스터 메이트 담당은 팀 번호 기준
//   개인별 배정(config.COACH_ASSIGNMENTS)으로 대체됨
export default function TeamSetup({ initial, existingLookup, onComplete, onSaving }) {
  const [teamNo, setTeamNo] = useState(initial?.teamId ? String(parseInt(initial.teamId, 10)) : '')
  const [memberCount, setMemberCount] = useState(initial?.memberCount || 4)
  const [allergyBlocks, setAllergyBlocks] = useState(() => toAllergyBlocks(initial?.allergies))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addPerson = () => setAllergyBlocks((blocks) => [...blocks, newBlock()])
  const removePerson = (id) => setAllergyBlocks((blocks) => blocks.filter((b) => b.id !== id))
  const toggleAllergyFor = (id, a) =>
    setAllergyBlocks((blocks) =>
      blocks.map((b) =>
        b.id === id
          ? { ...b, list: b.list.includes(a) ? b.list.filter((x) => x !== a) : [...b.list, a] }
          : b,
      ),
    )

  // 팀 번호를 입력하면, 이미 등록된 팀이면 정보를 미리 채워줌 (다른 팀원이 먼저 등록한 경우)
  const onTeamNoBlur = async () => {
    const id = normalizeTeam(teamNo)
    if (!id || !existingLookup) return
    const existing = await existingLookup(id)
    if (existing) {
      setMemberCount(existing.memberCount || memberCount)
      setAllergyBlocks(toAllergyBlocks(existing.allergies))
    }
  }

  const submit = async () => {
    setError('')
    const teamId = normalizeTeam(teamNo)
    if (!teamId) return setError('팀 번호를 입력해 주세요.')
    if (parseInt(teamNo, 10) > TOTAL_TEAMS) return setError(`팀 번호는 1~${TOTAL_TEAMS} 사이여야 합니다.`)
    if (!memberCount || memberCount < 1) return setError('인원수를 1명 이상 입력해 주세요.')

    // 알러지를 하나도 선택 안 한 빈 블록은 제외하고 저장 (사람별 배열)
    const allergies = allergyBlocks.map((b) => b.list).filter((list) => list.length > 0)

    const team = { teamId, memberCount, allergies }
    setSaving(true)
    onSaving?.(true)
    try {
      await onComplete(team)
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setSaving(false)
      onSaving?.(false)
    }
  }

  return (
    <div className="app">
      <header className="header setup-header">
        <div>
          <div className="header-table">팀 등록</div>
        </div>
        <img className="header-logo" src={logo52g} alt="52g" />
      </header>

      <GuideSection defaultOpen />

      <section className="card">
        {/* 여러 팀원이 각자 주문을 담으면 나중에 저장한 사람 것만 남습니다.
            (덮어쓰기 전에 확인 창이 뜨긴 하지만, 애초에 한 명이 담는 게 안전)
            먼저 읽어야 하는 안내라 소개 문구보다 위에 둡니다 */}
        <p className="setup-solo-note">👤 한 팀당 한 명씩만 팀 등록을 해주세요.</p>

        <p className="setup-intro">
          팀 번호를 입력하면 주문을 시작할 수 있어요.
        </p>

        <div className="setup-field">
          <label className="setup-label" htmlFor="team-no">
            팀 번호
          </label>
          <input
            id="team-no"
            className="setup-input"
            type="number"
            inputMode="numeric"
            min="1"
            max={TOTAL_TEAMS}
            placeholder={`1 ~ ${TOTAL_TEAMS}`}
            value={teamNo}
            onChange={(e) => setTeamNo(e.target.value)}
            onBlur={onTeamNoBlur}
          />
        </div>

        <div className="setup-field">
          <label className="setup-label">인원수</label>
          <div className="stepper">
            <button
              className="qty-btn"
              onClick={() => setMemberCount((n) => Math.max(1, n - 1))}
              aria-label="인원수 줄이기"
            >
              −
            </button>
            <span className="stepper-num">{memberCount}명</span>
            <button
              className="qty-btn"
              onClick={() => setMemberCount((n) => Math.min(MAX_MEMBER_COUNT, n + 1))}
              aria-label="인원수 늘리기"
            >
              +
            </button>
          </div>
        </div>

        <div className="setup-field">
          <label className="setup-label">알러지가 있다면 알려주세요!</label>

          {allergyBlocks.length === 0 && (
            <p className="empty-text">알러지가 있는 팀원이 없으면 비워두셔도 됩니다.</p>
          )}

          {allergyBlocks.map((block, i) => (
            <div key={block.id} className="allergy-person-block">
              <div className="allergy-person-head">
                <b>인원 {i + 1}</b>
                <button
                  className="btn-ghost"
                  onClick={() => removePerson(block.id)}
                  aria-label={`인원 ${i + 1} 삭제`}
                >
                  삭제
                </button>
              </div>
              <div className="chip-wrap">
                {ALLERGY_OPTIONS.map((a) => (
                  <button
                    key={a}
                    className={`setup-chip${block.list.includes(a) ? ' on' : ''}`}
                    onClick={() => toggleAllergyFor(block.id, a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
              {/* 고른 알러지가 실제로 어떤 결과가 되는지 즉시 보여줌 —
                  같은 끼니의 메뉴들이 성분을 거의 공유해서, 항목 하나로
                  "다른 메뉴 선택 가능"과 "대체식 필요"가 갈립니다.
                  잘못 체크한 경우도 이 자리에서 바로 알아챌 수 있음. */}
              {block.list.length > 0 && <DietSummary allergies={block.list} />}
            </div>
          ))}

          <button className="btn-ghost add-person-btn" onClick={addPerson}>
            + 알러지 있는 인원 추가
          </button>
        </div>

        {error && <p className="setup-error">{error}</p>}

        <button className="btn-primary setup-submit" onClick={submit} disabled={saving}>
          {saving ? '저장 중…' : '이 정보로 시작하기'}
        </button>
      </section>
    </div>
  )
}
