import { useCallback, useEffect, useRef, useState } from 'react'
import logo52g from './assets/52g-logo.png'
import { ADMIN_POLL_MS, COACH_ASSIGNMENTS } from './config.js'
import {
  storageGet,
  storageGetMany,
  storageSet,
  teamKey,
  orderKey,
  callKey,
  callCountKey,
  TEAM_ROSTER_KEY,
  COACH_ROSTER_KEY,
  SOLDOUT_KEY,
} from './lib/storage.js'
import { now, fmtClock } from './lib/time.js'
import { initAudio, playCallAlert } from './lib/audio.js'
import OrdersTab from './components/OrdersTab.jsx'
import CallsTab from './components/CallsTab.jsx'
import CoachStatusTab from './components/CoachStatusTab.jsx'
import CoachProfileSheet from './components/CoachProfileSheet.jsx'

const MY_COACH_KEY = 'torder-coach' // 이 기기의 마스터 메이트 정보(로컬)

// 마스터 메이트가 가장 자주 쓰는 화면이 위로 오도록. 첫 화면도 '호출 알림'.
const TAB_DEFS = [
  { id: 'calls', icon: '🔔', label: '호출 알림' },
  { id: 'coaches', icon: '🧑‍🏫', label: '마스터 메이트 현황' },
  { id: 'orders', icon: '📋', label: '주문 현황' },
]

// 배부 완료 상태 키 (팀별 분리 — 여러 러너가 동시에 체크해도 충돌 최소화)
// delivered:{teamId} → { [mealId]: true }
const deliveredKey = (teamId) => `delivered:${teamId}`

// 등록된 팀 전체 + 주문/호출/카운트 + 마스터 메이트 로스터 + 품절 + 배부상태를 한 번에 스캔
async function scanAll() {
  const roster = (await storageGet(TEAM_ROSTER_KEY)) || { ids: [] }
  const ids = roster.ids || []
  const [teamVals, orderVals, callVals, countVals, deliveredVals] = await Promise.all([
    storageGetMany(ids.map((id) => teamKey(id))),
    storageGetMany(ids.map((id) => orderKey(id))),
    storageGetMany(ids.map((id) => callKey(id))),
    storageGetMany(ids.map((id) => callCountKey(id))),
    storageGetMany(ids.map((id) => deliveredKey(id))),
  ])
  const teams = {}
  const orders = {}
  const calls = {}
  const counts = {}
  const delivered = {}
  ids.forEach((id, i) => {
    if (teamVals[i]) teams[id] = teamVals[i]
    if (orderVals[i]) orders[id] = orderVals[i]
    if (callVals[i]) calls[id] = callVals[i]
    counts[id] = typeof countVals[i] === 'number' ? countVals[i] : 0
    if (deliveredVals[i]) delivered[id] = deliveredVals[i]
  })
  const soldout = (await storageGet(SOLDOUT_KEY)) || {}
  const coachRoster = (await storageGet(COACH_ROSTER_KEY)) || { coaches: [] }
  return {
    teams,
    orders,
    calls,
    counts,
    delivered,
    soldout,
    coaches: coachRoster.coaches || [],
    at: now().getTime(),
  }
}

function getCoachId() {
  let id = window.localStorage.getItem('torder-coach-id')
  if (!id) {
    id = `coach-${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem('torder-coach-id', id)
  }
  return id
}

export default function App() {
  const [coach, setCoach] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(MY_COACH_KEY) || 'null')
    } catch {
      return null
    }
  })
  const [nameInput, setNameInput] = useState(coach?.name || '')
  // 입장 화면에서 입력한 글자로 좁혀 보여줄 후보 목록 (명단이 비면 자유 입력)
  const knownCoachNames = COACH_ASSIGNMENTS.map((c) => c.name).filter(Boolean)

  const [tab, setTab] = useState('calls') // 입장 직후 첫 화면
  const [menuOpen, setMenuOpen] = useState(false) // 모바일 좌상단 메뉴 팝업
  const [showProfile, setShowProfile] = useState(false) // 내 프로필 시트
  const [scan, setScan] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const [syncError, setSyncError] = useState(false)
  const knownWaitingIds = useRef(null)
  const soundOnRef = useRef(true)
  soundOnRef.current = soundOn

  const refresh = useCallback(async () => {
    let result
    try {
      result = await scanAll()
      setSyncError(false)
    } catch {
      setSyncError(true)
      return
    }
    const waitingIds = new Set(
      Object.values(result.calls).flatMap((c) =>
        (c.calls || []).filter((x) => x.status === 'waiting').map((x) => x.id),
      ),
    )
    if (knownWaitingIds.current) {
      const hasNew = [...waitingIds].some((id) => !knownWaitingIds.current.has(id))
      if (hasNew && soundOnRef.current) playCallAlert()
    }
    knownWaitingIds.current = waitingIds
    setScan(result)
  }, [])

  useEffect(() => {
    if (!coach) return
    refresh()
    const id = setInterval(refresh, ADMIN_POLL_MS)
    return () => clearInterval(id)
  }, [coach, refresh])

  // 마스터 메이트 등록: 로컬 저장 + 공유 마스터 메이트 로스터에 등록/갱신
  // name이 COACH_ASSIGNMENTS의 이름과 정확히 일치해야 담당 팀이 자동 연결됨
  const enterAsCoach = useCallback(async (name) => {
    const id = getCoachId()
    const record = { id, name }
    window.localStorage.setItem(MY_COACH_KEY, JSON.stringify(record))
    try {
      const roster = (await storageGet(COACH_ROSTER_KEY)) || { coaches: [] }
      const others = (roster.coaches || []).filter((c) => c.id !== id)
      await storageSet(COACH_ROSTER_KEY, { coaches: [...others, record] })
    } catch {
      /* 로스터 등록 실패해도 입장은 진행 — 다음 상태 변경 시 다시 시도됨 */
    }
    initAudio()
    setCoach(record)
  }, [])

  // 호출 상태 변경: 대기중 → 처리중(담당 마스터 메이트 기록) → 완료
  const updateCallStatus = useCallback(
    async (teamId, callId, nextStatus) => {
      try {
        const data = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
        const call = (data.calls || []).find((c) => c.id === callId)
        if (!call) return
        call.status = nextStatus
        if (nextStatus === 'in_progress') {
          call.handledBy = coach.name
          call.handledById = coach.id
          call.startedAt = now().getTime()
        }
        if (nextStatus === 'done') {
          call.handledBy = call.handledBy || coach.name
          call.handledById = call.handledById || coach.id
          call.doneAt = now().getTime()
        }
        await storageSet(callKey(teamId), data)
      } catch {
        alert('네트워크 오류로 호출 상태가 변경되지 않았습니다.\n잠시 후 다시 시도해주세요.')
        return
      }
      await refresh()
    },
    [coach, refresh],
  )

  // 배부 완료 토글 (팀별 delivered:{teamId} 레코드에 끼니별로 기록)
  const toggleDelivered = useCallback(
    async (teamId, mealId, next) => {
      try {
        const data = (await storageGet(deliveredKey(teamId))) || {}
        if (next) data[mealId] = true
        else delete data[mealId]
        await storageSet(deliveredKey(teamId), data)
      } catch {
        alert('네트워크 오류로 배부 상태가 저장되지 않았습니다.\n잠시 후 다시 시도해주세요.')
        return
      }
      await refresh()
    },
    [refresh],
  )

  const toggleSoldout = useCallback(
    async (menuId) => {
      try {
        const sold = (await storageGet(SOLDOUT_KEY)) || {}
        if (sold[menuId]) delete sold[menuId]
        else sold[menuId] = true
        await storageSet(SOLDOUT_KEY, sold)
      } catch {
        alert('네트워크 오류로 품절 상태가 변경되지 않았습니다.\n잠시 후 다시 시도해주세요.')
        return
      }
      await refresh()
    },
    [refresh],
  )

  if (!coach) {
    const query = nameInput.trim()
    // 이름을 전부 칩으로 깔면 40명 규모에서 화면이 잠기므로, 입력한 글자로
    // 좁혀가는 방식. 아직 아무것도 입력하지 않았으면 목록을 보여주지 않습니다.
    const matches = query
      ? knownCoachNames.filter((n) => n.replace(/\s/g, '').includes(query.replace(/\s/g, '')))
      : []
    const exact = knownCoachNames.some((n) => n === query)
    const rosterReady = knownCoachNames.length > 0

    return (
      <div className="gate">
        <div className="gate-card">
          <h1>🛠️ 해커톤 운영 관리자</h1>
          <p>본인 이름을 입력해 주세요.</p>
          {/* 후보 목록은 입력칸 아래에 '떠 있게'(absolute) 두어, 뜨고 사라질 때
              카드 크기가 바뀌지 않도록 합니다. 후보를 눌러도 입력칸만 채우고
              입장은 아래 버튼으로만 — 실수로 다른 사람으로 들어가는 걸 막습니다. */}
          <div className="gate-field">
            <input
              className="gate-input"
              placeholder={rosterReady ? '이름 검색 (예: 김)' : '이름 입력'}
              value={nameInput}
              autoComplete="off"
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                // 이름이 정확히 일치할 때만 엔터로 입장. 후보가 하나뿐이어도
                // 입력칸을 채워주기만 하고 입장은 버튼에 맡깁니다.
                if (exact || !rosterReady) enterAsCoach(query)
                else if (matches.length === 1) setNameInput(matches[0])
              }}
            />
            {rosterReady && query && !exact && (
              <div className="gate-suggest">
                {matches.length > 0 ? (
                  <>
                    {matches.slice(0, 8).map((name) => (
                      <button
                        key={name}
                        className="gate-suggest-item"
                        onClick={() => setNameInput(name)}
                      >
                        {name}
                      </button>
                    ))}
                    {matches.length > 8 && (
                      <p className="gate-more">
                        {matches.length}명 중 8명만 표시했습니다. 글자를 더 입력해 주세요.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="gate-nomatch">
                    명단에서 찾을 수 없는 이름입니다. 오타가 없는지 확인해 주세요.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 버튼은 항상 같은 자리에 하나만. 상태에 따라 라벨/활성만 바뀝니다.
              명단에 없는 이름으로도 들어갈 수 있게 두되(설정 전·누락 대비),
              담당 팀이 연결되지 않는다는 점을 라벨에 밝혀둡니다. */}
          <button
            className="btn-primary gate-enter"
            disabled={!query || (rosterReady && !exact && matches.length > 0)}
            onClick={() => enterAsCoach(query)}
          >
            {!query
              ? '입장하기'
              : !rosterReady || exact
                ? `${query} 님으로 입장하기`
                : matches.length > 0
                  ? '목록에서 이름을 선택해 주세요'
                  : '명단에 없는 이름으로 입장 (담당 팀 미배정)'}
          </button>
        </div>
      </div>
    )
  }

  // 아직 아무도 안 잡은 대기 호출 수 — 지금 몇 팀이 사람을 기다리는지(=투입 필요량) 지표.
  // 처리중(in_progress)은 이미 담당자가 붙은 상태라 합치지 않고 대기만 카운트.
  const waitingCount = scan
    ? Object.values(scan.calls).flatMap((c) => (c.calls || []).filter((x) => x.status === 'waiting'))
        .length
    : 0

  // 상단 KPI 스트립용 요약값 — 항상 의미 있는 4개
  const kpis = scan
    ? [
        { label: '대기 중 호출', value: waitingCount, tone: waitingCount > 0 ? 'alert' : undefined },
        { label: '주문한 팀', value: Object.keys(scan.orders).length },
        { label: '등록한 팀', value: Object.keys(scan.teams).length },
        { label: '입장한 마스터 메이트', value: scan.coaches.length },
      ]
    : []

  const activeTab = TAB_DEFS.find((t) => t.id === tab)
  const selectTab = (id) => {
    setTab(id)
    setMenuOpen(false)
  }

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="brand-row">
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">🖥️</span>
            <span className="brand-text">
              관리자 <b>페이지</b>
            </span>
          </div>
        </div>
        <nav className={`side-nav${menuOpen ? ' open' : ''}`}>
          <div className="drawer-head">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">🖥️</span>
              <span className="brand-text">
                관리자 <b>페이지</b>
              </span>
            </div>
            <button className="drawer-close" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">
              ✕
            </button>
          </div>
          {TAB_DEFS.map((td) => (
            <button
              key={td.id}
              className={`nav-item${tab === td.id ? ' active' : ''}`}
              onClick={() => selectTab(td.id)}
            >
              <span className="nav-icon" aria-hidden="true">{td.icon}</span>
              <span className="nav-label">{td.label}</span>
              {td.id === 'calls' && waitingCount > 0 && (
                <span className="nav-badge">{waitingCount}</span>
              )}
            </button>
          ))}
        </nav>
        {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
        <div className="side-foot">
          {/* 이름을 누르면 담당 팀 범위·알림 연결 상태를 확인하는 시트가 열립니다 */}
          <button
            className="side-coach"
            onClick={() => setShowProfile(true)}
            aria-haspopup="dialog"
            aria-label="내 프로필 보기"
          >
            🧑‍🏫 {coach.name}
            <span className="side-coach-chevron" aria-hidden="true">›</span>
          </button>
          <img className="side-foot-logo" src={logo52g} alt="52g" />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-icon" aria-hidden="true">{activeTab?.icon}</span>
            <h1>{activeTab?.label}</h1>
          </div>
          <div className="topbar-actions">
            {/* 좁은 화면에서는 사이드바 하단이 숨겨져 여기가 프로필 진입점 */}
            <button
              className="topbar-coach"
              onClick={() => setShowProfile(true)}
              aria-haspopup="dialog"
              aria-label="내 프로필 보기"
            >
              🧑‍🏫 {coach.name}
            </button>
            <label className="sound-toggle">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => {
                  initAudio()
                  setSoundOn(e.target.checked)
                }}
              />
              알림음
            </label>
            {scan && <span className="sync-time">동기화 {fmtClock(new Date(scan.at))}</span>}
            <button className="btn-ghost" onClick={refresh}>
              ⟳ 새로고침
            </button>
          </div>
        </header>

        {syncError && (
          <div className="sync-error">
            ⚠️ 공유 서버 연결 오류 — 최신 데이터가 아닐 수 있습니다. 자동으로 재시도 중입니다.
          </div>
        )}

        {kpis.length > 0 && (
          <div className="kpi-strip">
            {kpis.map((k) => (
              <div key={k.label} className={`kpi-card${k.tone ? ` ${k.tone}` : ''}`}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value">{k.value}</div>
              </div>
            ))}
          </div>
        )}

        <main className="content">
          {!scan ? (
            <div className="loading-card">데이터 불러오는 중…</div>
          ) : tab === 'orders' ? (
            <OrdersTab
              scan={scan}
              onToggleSoldout={toggleSoldout}
              onToggleDelivered={toggleDelivered}
            />
          ) : tab === 'coaches' ? (
            <CoachStatusTab scan={scan} coach={coach} />
          ) : (
            <CallsTab scan={scan} coach={coach} onUpdateStatus={updateCallStatus} />
          )}
        </main>
      </div>

      {showProfile && (
        <CoachProfileSheet
          scan={scan}
          coach={coach}
          onClose={() => setShowProfile(false)}
          onChangeName={() => {
            // 기기를 다른 사람이 쓰게 될 때: 저장된 이름을 지우고 입장 화면으로
            window.localStorage.removeItem(MY_COACH_KEY)
            setShowProfile(false)
            setCoach(null)
            setNameInput('')
          }}
        />
      )}
    </div>
  )
}
