import { useState } from 'react'
import { ALLERGY_OPTIONS, TOTAL_TEAMS, MAX_MEMBER_COUNT } from '../config.js'
import { normalizeTeam } from '../lib/storage.js'
import GuideSection from './GuideSection.jsx'

// 알러지 인원 블록의 React key 겸 식별자 생성 (사람별로 별개 목록을 구분하기 위함)
let blockSeq = 0
const newBlock = (list = []) => ({ id: `p${blockSeq++}`, list, customInput: '' })

// 저장된 team.allergies를 사람 단위 블록으로 변환.
// 예전 형식(사람 구분 없는 문자열 배열)이 남아있어도 각 항목을 1인分으로 감싸서
// 화면이 깨지지 않도록 방어 (list.filter 등이 문자열에는 없어 크래시하는 걸 방지)
const toAllergyBlocks = (allergies) =>
  (allergies || []).map((p) => newBlock(Array.isArray(p) ? p : [p]))

// QR은 모든 팀이 공유 → 첫 진입 시 팀 정보를 직접 입력 (PRD 요청 #2)
// 팀 번호 / 인원수 / 알러지(인원별로 구분 입력 — 1명이 여러 개인지,
// 여러 명이 각각 하나씩인지에 따라 대체 메뉴 준비량이 달라지므로 사람 단위로 관리)
// ※ 계열사는 더 이상 참가자가 선택하지 않음 — 캠프지기 담당은 팀 번호 기준
//   개인별 배정(config.COACH_ASSIGNMENTS)으로 대체됨
export default function TeamSetup({ initial, existingLookup, onComplete, onSaving }) {
  const [teamNo, setTeamNo] = useState(initial?.teamId ? String(parseInt(initial.teamId, 10)) : '')
  const [memberCount, setMemberCount] = useState(initial?.memberCount || 4)
  const [allergyBlocks, setAllergyBlocks] = useState(() => toAllergyBlocks(initial?.allergies))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addPerson = () => setAllergyBlocks((blocks) => [...blocks, newBlock()])
  const removePerson = (id) => setAllergyBlocks((blocks) => blocks.filter((b) => b.id !== id))
  const patchBlock = (id, patch) =>
    setAllergyBlocks((blocks) => blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  const toggleAllergyFor = (id, a) =>
    setAllergyBlocks((blocks) =>
      blocks.map((b) =>
        b.id === id
          ? { ...b, list: b.list.includes(a) ? b.list.filter((x) => x !== a) : [...b.list, a] }
          : b,
      ),
    )

  const addCustomFor = (id) => {
    const block = allergyBlocks.find((b) => b.id === id)
    const v = block?.customInput.trim()
    if (v && !block.list.includes(v)) patchBlock(id, { list: [...block.list, v], customInput: '' })
    else patchBlock(id, { customInput: '' })
  }

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
      </header>

      <GuideSection defaultOpen />

      <section className="card">
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
          <label className="setup-label">인원수 (음식 주문 개수 제한 기준)</label>
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
              <div className="custom-allergy-row">
                <input
                  className="setup-input"
                  placeholder="목록에 없는 알러지 직접 입력"
                  value={block.customInput}
                  onChange={(e) => patchBlock(block.id, { customInput: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomFor(block.id)}
                />
                <button className="btn-ghost" onClick={() => addCustomFor(block.id)}>
                  추가
                </button>
              </div>
              {block.list.filter((a) => !ALLERGY_OPTIONS.includes(a)).length > 0 && (
                <div className="custom-allergy-chips">
                  {block.list
                    .filter((a) => !ALLERGY_OPTIONS.includes(a))
                    .map((a) => (
                      <span
                        key={a}
                        className="custom-chip"
                        onClick={() => toggleAllergyFor(block.id, a)}
                      >
                        {a} ✕
                      </span>
                    ))}
                </div>
              )}
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
