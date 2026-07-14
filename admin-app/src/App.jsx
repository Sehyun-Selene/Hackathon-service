import { useCallback, useEffect, useRef, useState } from 'react'
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
import StatsTab from './components/StatsTab.jsx'

const MY_COACH_KEY = 'torder-coach' // 이 기기의 코치 정보(로컬)

const TAB_DEFS = [
  { id: 'orders', label: '📋 주문 현황' },
  { id: 'calls', label: '🔔 호출 알림' },
  { id: 'coaches', label: '🧑‍🏫 코치 현황' },
  { id: 'stats', label: '📊 통계' },
]

// 등록된 팀 전체 + 주문/호출/카운트 + 코치 로스터 + 품절 상태를 한 번에 스캔
async function scanAll() {
  const roster = (await storageGet(TEAM_ROSTER_KEY)) || { ids: [] }
  const ids = roster.ids || []
  const [teamVals, orderVals, callVals, countVals] = await Promise.all([
    storageGetMany(ids.map((id) => teamKey(id))),
    storageGetMany(ids.map((id) => orderKey(id))),
    storageGetMany(ids.map((id) => callKey(id))),
    storageGetMany(ids.map((id) => callCountKey(id))),
  ])
  const teams = {}
  const orders = {}
  const calls = {}
  const counts = {}
  ids.forEach((id, i) => {
    if (teamVals[i]) teams[id] = teamVals[i]
    if (orderVals[i]) orders[id] = orderVals[i]
    if (callVals[i]) calls[id] = callVals[i]
    counts[id] = typeof countVals[i] === 'number' ? countVals[i] : 0
  })
  const soldout = (await storageGet(SOLDOUT_KEY)) || {}
  const coachRoster = (await storageGet(COACH_ROSTER_KEY)) || { coaches: [] }
  return { teams, orders, calls, counts, soldout, coaches: coachRoster.coaches || [], at: now().getTime() }
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
  // 명단이 확정돼 이름이 채워지면 빠른 선택 칩으로 보여줌 (없으면 직접 입력만)
  const knownCoachNames = COACH_ASSIGNMENTS.map((c) => c.name).filter(Boolean)

  const [tab, setTab] = useState('orders')
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

  // 코치 등록: 로컬 저장 + 공유 코치 로스터에 등록/갱신
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

  // 호출 상태 변경: 대기중 → 처리중(담당 코치 기록) → 완료
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

  // 호출별 "팀 횟수 제한 포함 여부"를 관리자가 직접 판단해 조정.
  // 예: 테이블 흔들림 같은 시설 문제는 담당 코치가 처리하면서 제외로 바꿀 수 있음.
  // 팀의 누적 횟수(call-count)를 그 자리에서 가감함.
  const toggleCallCounts = useCallback(
    async (teamId, callId, nextCounts) => {
      try {
        const data = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
        const call = (data.calls || []).find((c) => c.id === callId)
        if (!call) return
        const prevCounts = call.countsTowardLimit !== false // 예전 데이터엔 필드 없을 수 있음 → 기본 true
        if (prevCounts === nextCounts) return
        call.countsTowardLimit = nextCounts
        await storageSet(callKey(teamId), data)
        const count = (await storageGet(callCountKey(teamId))) || 0
        const delta = nextCounts ? 1 : -1
        await storageSet(callCountKey(teamId), Math.max(0, (typeof count === 'number' ? count : 0) + delta))
      } catch {
        alert('네트워크 오류로 변경되지 않았습니다.\n잠시 후 다시 시도해주세요.')
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
    return (
      <div className="gate">
        <div className="gate-card">
          <h1>🛠️ 해커톤 운영 관리자</h1>
          <p>본인 이름을 선택하거나 입력해 주세요. (표시용, 계정 아님)</p>
          {knownCoachNames.length > 0 && (
            <div className="gate-companies">
              {knownCoachNames.map((name) => (
                <button
                  key={name}
                  className={`setup-chip${nameInput === name ? ' on' : ''}`}
                  onClick={() => setNameInput(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <input
            className="gate-input"
            placeholder="명단에 없으면 이름 직접 입력"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={!nameInput.trim()}
            onClick={() => enterAsCoach(nameInput.trim())}
          >
            입장하기
          </button>
        </div>
      </div>
    )
  }

  const waitingCount = scan
    ? Object.values(scan.calls).flatMap((c) => (c.calls || []).filter((x) => x.status !== 'done'))
        .length
    : 0

  return (
    <div className="admin">
      <header className="admin-header">
        <div className="admin-title">
          🛠️ 해커톤 운영 관리자{' '}
          <span className="admin-name">— {coach.name}</span>
        </div>
        <div className="admin-header-right">
          <label className="sound-toggle">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => {
                initAudio()
                setSoundOn(e.target.checked)
              }}
            />
            🔔 알림음
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

      <nav className="tabs">
        {TAB_DEFS.map((td) => (
          <button
            key={td.id}
            className={`tab-btn${tab === td.id ? ' active' : ''}`}
            onClick={() => setTab(td.id)}
          >
            {td.label}
            {td.id === 'calls' && waitingCount > 0 && (
              <span className="tab-badge">{waitingCount}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="admin-main">
        {!scan ? (
          <p className="empty-text">데이터 불러오는 중…</p>
        ) : tab === 'orders' ? (
          <OrdersTab scan={scan} onToggleSoldout={toggleSoldout} />
        ) : tab === 'calls' ? (
          <CallsTab
            scan={scan}
            coach={coach}
            onUpdateStatus={updateCallStatus}
            onToggleCounts={toggleCallCounts}
          />
        ) : tab === 'coaches' ? (
          <CoachStatusTab scan={scan} coach={coach} />
        ) : (
          <StatsTab scan={scan} />
        )}
      </main>
    </div>
  )
}
