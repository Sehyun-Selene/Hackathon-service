import { useCallback, useEffect, useRef, useState } from 'react'
import logo52g from './assets/52g-logo.png'
import {
  ADMIN_POLL_MS,
  ADMIN_CREW,
  DARK_MODE_HOURS,
  MEALS,
  MENU_BY_ID,
  crewLabel,
  crewFor,
} from './config.js'
import {
  storageGet,
  storageGetMany,
  teamKey,
  orderKey,
  callKey,
  callCountKey,
  TEAM_ROSTER_KEY,
  COACH_ROSTER_KEY,
  adminSnapshot,
  coachUpsert,
  callStatusSet,
  flagSet,
  SOLDOUT_KEY,
} from './lib/storage.js'
import {
  now,
  fmtAgo,
  getNextMeal,
  getOpenMeals,
  getVisibleMeals,
  fmtTimeWithSec,
} from './lib/time.js'
import { initAudio, playCallAlert } from './lib/audio.js'
import OrdersTab from './components/OrdersTab.jsx'
import CallsTab from './components/CallsTab.jsx'
import CoachStatusTab from './components/CoachStatusTab.jsx'
import CoachProfileSheet from './components/CoachProfileSheet.jsx'
import KpiDetailSheet from './components/KpiDetailSheet.jsx'

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
  const snapshot = await adminSnapshot()
  if (snapshot) return snapshot

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

// 주문 현황에서 처음 보여줄 식사 — 지금 주문받는 중인 식사가 있으면 그것,
// 없으면 이미 지난 식사 중 마지막, 그것도 없으면 다음 식사
function getDefaultMealId() {
  const t = now().getTime()
  const open = getOpenMeals(t)
  if (open.length) return open[0].id
  const visible = getVisibleMeals(t)
  if (visible.length) return visible[visible.length - 1].id
  return getNextMeal(t)?.id || MEALS[MEALS.length - 1].id
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
  const [nameInput, setNameInput] = useState('')
  // 명단에서 고른 사람. 이름이 겹치는 분이 있어(이상윤 두 분) 이름 대신
  // 명단 항목 자체를 고르게 합니다 — 오타로 담당 팀이 안 붙는 것도 막습니다.
  const [pickedCrew, setPickedCrew] = useState(null)

  const [tab, setTab] = useState('calls') // 입장 직후 첫 화면
  // 주문 현황의 식사 선택 — 좌측 메뉴의 하위 항목으로 노출되므로 여기서 관리
  const [mealFilter, setMealFilter] = useState(getDefaultMealId)
  const [menuOpen, setMenuOpen] = useState(false) // 모바일 좌상단 메뉴 팝업
  const [showProfile, setShowProfile] = useState(false) // 내 프로필 시트
  const [kpiDetail, setKpiDetail] = useState(null) // 눌린 진행 현황의 상세 목록
  // 프로필에서 연 상세를 닫으면 프로필로 돌아갑니다. 열었던 자리로 돌아가지
  // 않으면 숫자 세 개를 차례로 확인할 때마다 프로필을 다시 열어야 합니다.
  const [detailFromProfile, setDetailFromProfile] = useState(false)
  const [scan, setScan] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const [syncError, setSyncError] = useState(false)
  const [undoToast, setUndoToast] = useState(null)
  const knownWaitingIds = useRef(null)
  const refreshRunning = useRef(false)
  // 새로고침이 눌렸다는 신호. 요청은 대개 1초 안에 끝나 그냥 두면 아무 일도
  // 없었던 것처럼 보입니다 — 최소 0.5초는 돌려서 눌린 걸 보여줍니다.
  const [refreshing, setRefreshing] = useState(false)
  const undoTimer = useRef(null)
  const undoActionRef = useRef(null)
  const soundOnRef = useRef(true)
  soundOnRef.current = soundOn

  // 되돌릴 것이 없는 단순 알림 — 같은 토스트를 씁니다
  const showToast = useCallback((message) => {
    window.clearTimeout(undoTimer.current)
    undoActionRef.current = null
    setUndoToast({ message })
    undoTimer.current = window.setTimeout(() => setUndoToast(null), 4000)
  }, [])

  const showUndo = useCallback((message, undo) => {
    window.clearTimeout(undoTimer.current)
    undoActionRef.current = undo
    setUndoToast({ message })
    undoTimer.current = window.setTimeout(() => {
      undoActionRef.current = null
      setUndoToast(null)
    }, 8000)
  }, [])

  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  // 밤샘 운영이라 새벽까지 흰 화면을 보게 됩니다. 참가자 앱과 같은 시간대
  // 규칙으로 자동 전환합니다 (config.DARK_MODE_HOURS).
  const hour = now().getHours()
  const { start: darkStart, end: darkEnd } = DARK_MODE_HOURS
  const isDark =
    darkStart > darkEnd ? hour >= darkStart || hour < darkEnd : hour >= darkStart && hour < darkEnd
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const refresh = useCallback(async () => {
    // 누른 티는 먼저 냅니다. 3초마다 도는 자동 갱신과 겹치면 아래에서
    // 곧장 빠져나가는데, 그때도 아무 반응이 없으면 버튼이 고장 난 것처럼 보입니다.
    setRefreshing(true)
    const spunUntil = Date.now() + 500
    const stopSpinning = async () => {
      const left = spunUntil - Date.now()
      if (left > 0) await new Promise((r) => setTimeout(r, left))
      setRefreshing(false)
    }
    // 요청까지 겹쳐 보내지는 않습니다 — 이미 받고 있는 응답이 곧 반영됩니다
    if (refreshRunning.current) {
      stopSpinning()
      return
    }
    refreshRunning.current = true
    let result
    try {
      result = await scanAll()
      setSyncError(false)
    } catch {
      setSyncError(true)
      refreshRunning.current = false
      stopSpinning()
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
    refreshRunning.current = false
    stopSpinning()
  }, [])

  const runUndo = useCallback(async () => {
    const action = undoActionRef.current
    if (!action) return
    window.clearTimeout(undoTimer.current)
    undoActionRef.current = null
    setUndoToast(null)
    try {
      await action()
    } catch {
      alert('실행 취소를 저장하지 못했습니다. 최신 상태를 다시 확인해주세요.')
      await refresh()
    }
  }, [refresh])

  useEffect(() => {
    if (!coach) return
    let stopped = false
    let timer
    const run = async () => {
      await refresh()
      if (!stopped) timer = window.setTimeout(run, ADMIN_POLL_MS + Math.random() * 500)
    }
    run()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [coach, refresh])

  // 저장된 이름으로 자동 입장한 경우에도 메이트 목록에 다시 등록합니다.
  // 입장 버튼을 거치지 않으면 목록에 안 들어가서, 행사 전 초기화 뒤에는
  // 본인은 정상 입장한 듯 보이지만 '마스터 메이트 현황'에서 빠집니다.
  // (서버가 id 기준으로 갱신하므로 여러 번 불러도 안전)
  useEffect(() => {
    if (!coach?.id) return
    coachUpsert(coach.id, coach.name, coach.crewId).catch(() => {})
    const id = window.setInterval(
      () => coachUpsert(coach.id, coach.name, coach.crewId).catch(() => {}),
      30_000,
    )
    return () => window.clearInterval(id)
  }, [coach?.id, coach?.name])

  // 저장된 이름으로 자동 입장한 뒤 새로고침하면 AudioContext가 사라집니다.
  // 첫 탭/키 입력에서 다시 활성화해 호출음이 무음이 되는 일을 막습니다.
  useEffect(() => {
    if (!coach) return undefined
    const unlock = () => initAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [coach])

  // 입장: 기기에 저장 + 공유 크루 목록에 등록/갱신
  // 담당 팀은 이름이 아니라 crewId로 찾습니다. 같은 이름이 둘 있어
  // 이름으로 찾으면 둘 중 아무나 걸립니다.
  const enterAsCoach = useCallback(async (member) => {
    const id = getCoachId()
    const record = { id, name: member.name, crewId: member.id }
    window.localStorage.setItem(MY_COACH_KEY, JSON.stringify(record))
    try {
      // 목록 갱신은 서버에서 원자적으로 — 40명이 같은 시각에 입장해도
      // 서로를 목록에서 지우지 않게
      await coachUpsert(id, member.name, member.id)
    } catch {
      /* 로스터 등록 실패해도 입장은 진행 — 다음 상태 변경 시 다시 시도됨 */
    }
    initAudio()
    setCoach(record)
  }, [])

  // 호출 상태 변경: 대기중 → 처리중(담당 마스터 메이트 기록) → 완료
  const updateCallStatus = useCallback(
    async (teamId, callId, nextStatus, previousCall) => {
      try {
        // 그 호출 하나만 서버에서 고칩니다. 목록 전체를 덮어쓰면 같은 순간에
        // 참가자가 넣은 새 호출이 사라질 수 있습니다.
        await callStatusSet(teamId, callId, nextStatus, coach)
      } catch (err) {
        if (err?.code === 'status conflict') {
          alert('다른 마스터 메이트가 먼저 상태를 변경했습니다.\n최신 상태를 다시 불러옵니다.')
          await refresh()
          return
        }
        alert('네트워크 오류로 호출 상태가 변경되지 않았습니다.\n잠시 후 다시 시도해주세요.')
        return
      }
      await refresh()
      if (nextStatus === 'waiting') {
        const previousHandler = {
          id: previousCall?.handledById || coach?.id,
          name: previousCall?.handledBy || coach?.name,
        }
        showUndo(`팀 ${teamId} 호출을 대기 상태로 되돌렸습니다.`, async () => {
          await callStatusSet(teamId, callId, 'in_progress', previousHandler)
          await refresh()
        })
      }
    },
    [coach, refresh, showUndo],
  )

  // 배부 완료 토글 (팀별 delivered:{teamId} 레코드에 끼니별로 기록)
  const toggleDelivered = useCallback(
    async (teamId, mealId, next) => {
      try {
        await flagSet(deliveredKey(teamId), mealId, next)
      } catch {
        alert('네트워크 오류로 배부 상태가 저장되지 않았습니다.\n잠시 후 다시 시도해주세요.')
        return
      }
      await refresh()
      showUndo(`팀 ${teamId}의 배부 상태를 ${next ? '완료' : '미완료'}로 변경했습니다.`, async () => {
        await flagSet(deliveredKey(teamId), mealId, !next)
        await refresh()
      })
    },
    [refresh, showUndo],
  )

  const toggleSoldout = useCallback(
    async (menuId) => {
      try {
        // 현재 상태의 반대로 — 화면이 알고 있는 값을 기준으로 켜고 끕니다.
        // scan을 읽으므로 의존성에 포함해야 합니다. 빠뜨리면 첫 렌더의 옛 값이
        // 클로저에 갇혀 토글 방향이 뒤집힙니다.
        const next = !scan?.soldout?.[menuId]
        await flagSet(SOLDOUT_KEY, menuId, next)
        await refresh()
        const menuName = MENU_BY_ID[menuId]?.name?.replace('\n', ' ') || menuId
        showUndo(`${menuName}을(를) ${next ? '품절 처리' : '품절 해제'}했습니다.`, async () => {
          await flagSet(SOLDOUT_KEY, menuId, !next)
          await refresh()
        })
      } catch {
        alert('네트워크 오류로 품절 상태가 변경되지 않았습니다.\n잠시 후 다시 시도해주세요.')
        return
      }
    },
    [refresh, scan, showUndo],
  )

  if (!coach) {
    const query = nameInput.trim()
    const squash = (t) => String(t || '').replace(/\s/g, '').toLowerCase()
    // 45명을 전부 깔면 화면이 잠기므로 입력한 글자로 좁혀갑니다. 이름뿐 아니라
    // 닉네임·회사로도 찾게 두었습니다 — 본인을 찾는 방법이 하나뿐이면
    // 한글 이름이 기억나지 않는 순간에 막힙니다.
    // 아직 누구인지 정해지지 않은 자리(placeholder)는 고를 수 없게 뺍니다 —
    // 소속으로 검색한 사람이 '미정'을 자기 자리로 착각하면, 담당 팀도 없고
    // 슬랙 멘션도 없는 상태로 운영에 들어가게 됩니다.
    const selectable = ADMIN_CREW.filter((c) => !c.placeholder)
    const matches = query
      ? selectable.filter(
          (c) =>
            squash(c.name).includes(squash(query)) ||
            squash(c.nickname).includes(squash(query)) ||
            squash(c.company).includes(squash(query)),
        )
      : []
    const rosterReady = selectable.length > 0

    return (
      <div className="gate">
        <div className="gate-card">
          <h1>🛠️ 해커톤 운영 관리자</h1>
          <p>명단에서 본인을 찾아 주세요.</p>
          {/* 후보 목록은 입력칸 아래에 '떠 있게'(absolute) 두어, 뜨고 사라질 때
              카드 크기가 바뀌지 않도록 합니다. 후보를 눌러도 고르기만 하고
              입장은 아래 버튼으로만 — 실수로 다른 사람으로 들어가는 걸 막습니다. */}
          <div className="gate-field">
            <input
              className="gate-input"
              placeholder="이름·닉네임 검색 (예: 김, Ryan)"
              value={nameInput}
              autoComplete="off"
              onChange={(e) => {
                setNameInput(e.target.value)
                setPickedCrew(null)
              }}
              onKeyDown={(e) => {
                // 후보가 하나로 좁혀졌을 때만 엔터로 고릅니다. 입장은 버튼에 맡깁니다.
                if (e.key === 'Enter' && matches.length === 1) {
                  setPickedCrew(matches[0])
                  setNameInput(crewLabel(matches[0]))
                }
              }}
            />
            {query && !pickedCrew && (
              <div className="gate-suggest">
                {matches.length > 0 ? (
                  <>
                    {matches.slice(0, 8).map((member) => (
                      <button
                        key={member.id}
                        className="gate-suggest-item"
                        onClick={() => {
                          setPickedCrew(member)
                          setNameInput(crewLabel(member))
                        }}
                      >
                        <b>{member.name}</b>
                        {/* 이름이 같은 분이 있어 닉네임·회사까지 보여야 고를 수 있습니다 */}
                        <span className="gate-suggest-sub">
                          {[member.nickname, member.company].filter(Boolean).join(' · ')}
                        </span>
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
                    명단에서 찾을 수 없습니다. 이름 대신 닉네임으로도 찾아보세요.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 버튼은 항상 같은 자리에 하나만. 상태에 따라 라벨/활성만 바뀝니다. */}
          <button
            className="btn-primary gate-enter"
            disabled={!pickedCrew || !rosterReady}
            onClick={() => pickedCrew && enterAsCoach(pickedCrew)}
          >
            {pickedCrew
              ? `${crewLabel(pickedCrew)} 님으로 입장하기`
              : query
                ? '목록에서 본인을 선택해 주세요'
                : '입장하기'}
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
          {/* 좁은 화면에서는 사이드바 하단(.side-foot)이 숨겨지므로 이 줄의
              오른쪽 끝을 프로필 진입점으로 씁니다 */}
          <button
            className="topbar-coach"
            onClick={() => setShowProfile(true)}
            aria-haspopup="dialog"
            aria-label="내 프로필 보기"
          >
            🧑‍🏫 {crewLabel(crewFor(coach)) || coach.name}
          </button>
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
            <div key={td.id} className="nav-group">
              <button
                className={`nav-item${tab === td.id ? ' active' : ''}`}
                onClick={() => selectTab(td.id)}
              >
                <span className="nav-icon" aria-hidden="true">{td.icon}</span>
                <span className="nav-label">{td.label}</span>
                {td.id === 'calls' && waitingCount > 0 && (
                  <span className="nav-badge">{waitingCount}</span>
                )}
              </button>
              {/* 주문 현황은 식사별로 보므로 하위 항목으로 노출 */}
              {td.id === 'orders' && tab === 'orders' && (
                <div className="nav-sub">
                  {MEALS.map((m) => (
                    <button
                      key={m.id}
                      className={`nav-subitem${mealFilter === m.id ? ' active' : ''}`}
                      onClick={() => {
                        setMealFilter(m.id)
                        setMenuOpen(false)
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            🧑‍🏫 {crewLabel(crewFor(coach)) || coach.name}
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
            {scan && (
              <span className="sync-time">
                <span className="narrow-hide">동기화 </span>
                {/* 초까지 보여줍니다. 3초마다 저절로 바뀌므로, 누르지 않아도
                    화면이 살아 있다는 것이 이 숫자로 드러납니다. */}
                {fmtTimeWithSec(new Date(scan.at))}
              </span>
            )}
            <button
              className={`btn-ghost sync-refresh${refreshing ? ' spinning' : ''}`}
              onClick={refresh}
              disabled={refreshing}
              aria-label="새로고침"
            >
              <span className="sync-refresh-icon" aria-hidden="true">
                ⟳
              </span>
              <span className="narrow-hide"> 새로고침</span>
            </button>
          </div>
        </header>

        {syncError && (
          <div className="sync-error" role="status">
            <span>
              ⚠️ 공유 서버 연결 오류 — 최신 데이터가 아닐 수 있습니다.
              <small>
                {scan?.at
                  ? `마지막 정상 동기화: ${fmtAgo(now().getTime() - new Date(scan.at).getTime())}`
                  : '아직 정상 동기화 기록이 없습니다.'}
              </small>
            </span>
            <button type="button" onClick={refresh}>지금 재시도</button>
          </div>
        )}

        <main className="content">
          {!scan ? (
            <div className="loading-card">데이터 불러오는 중…</div>
          ) : tab === 'orders' ? (
            <OrdersTab
              scan={scan}
              mealFilter={mealFilter}
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

      {kpiDetail && scan && (
        <KpiDetailSheet
          kind={kpiDetail}
          scan={scan}
          coach={coach}
          mealFilter={mealFilter}
          onToast={showToast}
          onClose={() => {
            setKpiDetail(null)
            if (detailFromProfile) setShowProfile(true)
            setDetailFromProfile(false)
          }}
        />
      )}

      {showProfile && (
        <CoachProfileSheet
          scan={scan}
          coach={coach}
          onOpenDetail={(kind) => {
            setShowProfile(false)
            setDetailFromProfile(true)
            setKpiDetail(kind)
          }}
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

      {undoToast && (
        <div className="undo-toast" role="status">
          <span>{undoToast.message}</span>
          {undoActionRef.current && (
            <button type="button" onClick={runUndo}>실행 취소</button>
          )}
        </div>
      )}
    </div>
  )
}
