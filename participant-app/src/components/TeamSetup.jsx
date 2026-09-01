import { useState } from 'react'
import logo52g from '../assets/52g-logo.png'
import {
  ALLERGY_OPTIONS,
  LEAGUES,
  TEAMS,
  MAX_MEMBER_COUNT,
  MEALS,
  MENUS,
  leagueOf,
  personDiet,
  teamLabel,
  leagueNumberHint,
} from '../config.js'
import { normalizeTeam } from '../lib/storage.js'
import GuideSection from './GuideSection.jsx'

// 알레르기 인원 블록의 React key 겸 식별자 생성 (사람별로 별개 목록을 구분하기 위함)
let blockSeq = 0
const newBlock = (list = []) => ({ id: `p${blockSeq++}`, list })

// 저장된 team.allergies를 사람 단위 블록으로 변환.
// 예전 형식(사람 구분 없는 문자열 배열)이 남아있어도 각 항목을 1인分으로 감싸서
// 화면이 깨지지 않도록 방어 (list.filter 등이 문자열에는 없어 크래시하는 걸 방지)
const toAllergyBlocks = (allergies) =>
  (allergies || []).map((p) => newBlock(Array.isArray(p) ? p : [p]))

// 한 사람의 알레르기 선택 결과를 사람이 읽을 수 있는 안내로 바꿔 보여줌.
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
// 팀 번호 / 알레르기(인원별로 구분 입력 — 1명이 여러 개인지,
// 여러 명이 각각 하나씩인지에 따라 대체 메뉴 준비량이 달라지므로 사람 단위로 관리)
// ※ 계열사는 더 이상 참가자가 선택하지 않음 — 마스터 메이트 담당은 팀 번호 기준
//   개인별 배정(config.COACH_ASSIGNMENTS)으로 대체됨
export default function TeamSetup({ initial, existingLookup, onComplete, onSaving }) {
  // 테이블 번호는 리그 접두어까지가 한 팀입니다(E-45 / G-12).
  // 리그를 먼저 고르면 입력칸 앞에 접두어가 붙고 숫자만 입력하면 됩니다.
  const [league, setLeague] = useState(
    () => leagueOf(initial?.teamId)?.id || LEAGUES[0].id,
  )
  const [teamNo, setTeamNo] = useState(
    initial?.teamId ? String(parseInt(String(initial.teamId).slice(2), 10)) : '',
  )
  const [allergyBlocks, setAllergyBlocks] = useState(() => toAllergyBlocks(initial?.allergies))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // 사용자가 알레르기를 건드렸는지 — 건드린 뒤에는 서버 값으로 덮어쓰지
  // 않습니다 (팀 번호 칸을 다시 눌렀다 나오면 입력이 되돌아가던 문제)
  const [touched, setTouched] = useState(false)
  // 입력한 번호가 이미 등록된 팀일 때 알려줍니다 (오타로 남의 팀을 덮어쓰는 것 방지)
  const [existingInfo, setExistingInfo] = useState(null)
  // 등록 직전 서버 조회 중 — 버튼을 잠가 두 번 눌리는 것을 막습니다
  const [checking, setChecking] = useState(false)

  const leagueDef = LEAGUES.find((l) => l.id === league) || LEAGUES[0]
  // 지금 입력한 번호가 가리키는 팀 (등록 버튼을 누를 때 확인창으로 보여줍니다)
  const typedId = normalizeTeam(teamNo, leagueDef.prefix)
  const known = typedId ? TEAMS[typedId] : null
  // 인원수는 자리배치 시트에 이미 있으니 입력받지 않습니다.
  // 번호를 고르면 그 팀 인원이 그대로 쓰입니다.
  const memberCount = known?.size ?? initial?.memberCount ?? null
  // 번호를 아직 안 넣었으면 알레르기 인원을 임시 상한으로 받아둡니다
  const allergyMax = memberCount ?? MAX_MEMBER_COUNT

  const allergyFull = allergyBlocks.length >= allergyMax
  const addPerson = () => {
    if (allergyFull) return
    setTouched(true)
    setAllergyBlocks((blocks) => [...blocks, newBlock()])
  }
  const removePerson = (id) => {
    setTouched(true)
    setAllergyBlocks((blocks) => blocks.filter((b) => b.id !== id))
  }
  const toggleAllergyFor = (id, a) => {
    setTouched(true)
    setAllergyBlocks((blocks) =>
      blocks.map((b) =>
        b.id === id
          ? { ...b, list: b.list.includes(a) ? b.list.filter((x) => x !== a) : [...b.list, a] }
          : b,
      ),
    )
  }

  // 팀 번호를 입력하면, 이미 등록된 팀이면 정보를 미리 채워줌 (다른 팀원이 먼저 등록한 경우)
  const onTeamNoBlur = async () => {
    const id = normalizeTeam(teamNo, leagueDef.prefix)
    setExistingInfo(null)
    if (!id) return setError('')
    // 자리배치표에 없는 번호면 여기서 끝냅니다. 등록 여부를 먼저 물으면
    // 남아 있던 옛 기록 때문에 '이미 등록된 팀'이라는 엉뚱한 안내가 뜹니다.
    if (!TEAMS[id]) {
      return setError(
        leagueDef.label + '에 ' + id + ' 테이블이 없습니다. 리그와 번호를 확인해 주세요.',
      )
    }
    setError('')
    if (!existingLookup) return
    const existing = await existingLookup(id)
    if (!existing) return
    // 우리 팀 정보를 편집하는 중이면 안내가 필요 없습니다
    const isMine = initial?.teamId === id
    if (!isMine) setExistingInfo({ teamId: id, memberCount: existing.memberCount })
    // 사용자가 이미 값을 고쳤다면 덮어쓰지 않습니다 — 입력이 되돌아가는 것 방지
    if (touched) return
    setAllergyBlocks(toAllergyBlocks(existing.allergies))
  }

  const submit = async () => {
    setError('')
    const teamId = normalizeTeam(teamNo, leagueDef.prefix)
    if (!teamId) return setError('테이블 번호를 입력해 주세요.')
    // 자리배치 시트에 없는 번호 — 오타이거나 다른 리그일 가능성이 큽니다.
    // 등록 여부보다 먼저 봅니다: 없는 자리에 '이미 등록됨'은 말이 안 됩니다.
    if (!TEAMS[teamId]) {
      setExistingInfo(null)
      return setError(
        leagueDef.label + '에 ' + teamId + ' 테이블이 없습니다. 리그와 번호를 확인해 주세요.',
      )
    }

    const 팀 = TEAMS[teamId]
    const isEditingSelf = initial?.teamId === teamId
    // 번호가 맞는지 한 번 확인받습니다 — 잘못 누르면 남의 팀으로 주문이 들어갑니다
    if (!isEditingSelf) {
      // 팀명이 아직 정해지지 않은 외부사는 회사명으로 확인시켜 줍니다.
      // 빈 이름을 보여주면 확인이 되지 않습니다.
      const 이름 = teamLabel(teamId)
      const ok = window.confirm(
        `${teamId}${이름 ? ` · ${이름}` : ''} (${팀.size}명)\n\n이 팀이 맞으신가요?`,
      )
      if (!ok) return
    }

    // ── 이미 등록된 팀인지 여기서 직접 확인합니다 ──
    // blur가 채워둔 값(existingInfo)에 의존하면 안 됩니다. 버튼을 누르는 순간
    // blur의 서버 조회가 막 시작되므로, 조회가 끝나기 전에 등록이 진행돼
    // 경고가 뜨자마자 다음 화면으로 넘어가 버립니다.
    if (!isEditingSelf && existingLookup) {
      setChecking(true)
      let existing = null
      try {
        existing = await existingLookup(teamId)
      } catch {
        /* 통신 실패면 확인할 수 없으므로 그대로 진행합니다 */
      }
      setChecking(false)
      if (existing) {
        setExistingInfo({ teamId, memberCount: existing.memberCount })
        // 등록은 막고 입장만 허용합니다. 하드 차단을 하면 등록한 사람 폰이
        // 꺼졌을 때 다른 팀원이 마스터 메이트를 호출할 수 없게 됩니다.
        const join = window.confirm(
          `이미 등록된 팀입니다 (팀 ${teamId} · ${existing.memberCount || '?'}명).\n\n` +
            '확인 = 우리 팀이 맞습니다. 등록된 정보로 입장합니다\n' +
            '취소 = 팀 번호를 다시 확인합니다',
        )
        if (!join) {
          setError('이미 등록된 팀입니다. 팀 번호를 다시 확인해 주세요.')
          return
        }
        // 기존 정보를 덮어쓰지 않습니다 — 입력한 값이 아니라 등록된 값으로 입장
        setSaving(true)
        onSaving?.(true)
        try {
          await onComplete({
            teamId,
            memberCount: existing.memberCount,
            allergies: existing.allergies || [],
          })
        } catch {
          setError('네트워크 오류로 입장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
          setSaving(false)
          onSaving?.(false)
        }
        return
      }
    }

    // 알레르기를 하나도 선택 안 한 빈 블록은 제외하고 저장 (사람별 배열)
    const allergies = allergyBlocks.map((b) => b.list).filter((list) => list.length > 0)
    // 알레르기 인원이 팀 인원수를 넘으면 대체식 준비 수량이 실제보다 많아집니다
    if (allergies.length > 팀.size) {
      return setError(
        '알레르기 인원(' + allergies.length + '명)이 팀 인원(' + 팀.size +
          '명)보다 많습니다. 확인해 주세요.',
      )
    }

    const team = { teamId, memberCount: 팀.size, allergies }
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

        <div className="setup-field">
          <label className="setup-label">리그</label>
          {/* 필드리그 E-45, 개발자리그 G-12 — 접두어가 다르면 다른 팀입니다 */}
          <div className="league-tabs">
            {LEAGUES.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`league-tab${league === l.id ? ' on' : ''}`}
                onClick={() => {
                  setLeague(l.id)
                  setExistingInfo(null)
                }}
              >
                {l.label}
                <span className="league-tab-code">{l.prefix}-</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-field">
          <label className="setup-label" htmlFor="team-no">
            테이블 번호
          </label>
          {/* 접두어를 칸 안에 고정으로 보여줍니다. 참가자는 테이블에 붙은
              번호의 숫자 부분만 입력하면 됩니다 */}
          <div className="team-no-field">
            <span className="team-no-prefix">{leagueDef.prefix}-</span>
            <input
              id="team-no"
              className="setup-input team-no-input"
              type="number"
              inputMode="numeric"
              min="1"
              max={leagueDef.count}
              placeholder={leagueNumberHint(leagueDef.id)}
              value={teamNo}
              onChange={(e) => {
                setTeamNo(e.target.value)
                // 고치는 중에는 이전 안내를 지웁니다 — 서로 어긋나는 문구가
                // 위아래로 같이 떠 있으면 무엇이 문제인지 알 수 없습니다
                setExistingInfo(null)
                setError('')
              }}
              onBlur={onTeamNoBlur}
            />
          </div>
          {/* 오타로 다른 팀 번호를 넣으면 그 팀 정보를 덮어쓰게 되므로 알려줍니다 */}
          {existingInfo && (
            <p className="setup-exists">
              ⚠️ 이미 등록된 팀입니다 (팀 {existingInfo.teamId}
              {existingInfo.memberCount ? ' · ' + existingInfo.memberCount + '명' : ''}). 팀 번호가
              맞는지 확인해 주세요.
            </p>
          )}
        </div>

        <div className="setup-field">
          <label className="setup-label">알레르기가 있다면 알려주세요!</label>

          {allergyBlocks.length === 0 && (
            <p className="empty-text">알레르기가 있는 팀원이 없으면 비워두셔도 됩니다.</p>
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
              {/* 고른 알레르기가 실제로 어떤 결과가 되는지 즉시 보여줌 —
                  같은 끼니의 메뉴들이 성분을 거의 공유해서, 항목 하나로
                  "다른 메뉴 선택 가능"과 "대체식 필요"가 갈립니다.
                  잘못 체크한 경우도 이 자리에서 바로 알아챌 수 있음. */}
              {block.list.length > 0 && <DietSummary allergies={block.list} />}
            </div>
          ))}

          <button
            className="btn-ghost add-person-btn"
            onClick={addPerson}
            disabled={allergyFull}
          >
            {allergyFull
              ? '팀 인원(' + allergyMax + '명)만큼 추가했습니다'
              : '+ 알레르기 있는 인원 추가'}
          </button>
        </div>

        {error && <p className="setup-error">{error}</p>}

        <button
          className="btn-primary setup-submit"
          onClick={submit}
          disabled={saving || checking}
        >
          {saving ? '저장 중…' : checking ? '확인 중…' : '이 정보로 시작하기'}
        </button>
      </section>
    </div>
  )
}
