import { useCallback, useEffect, useRef, useState } from 'react'
import { PARTICIPANT_POLL_MS, DARK_MODE_HOURS, getAssignedCoachForTeam } from './config.js'
import {
  storageGet,
  storageGetMany,
  storageSet,
  rosterAddTeam,
  callAdd,
  teamKey,
  orderKey,
  callKey,
  callCountKey,
  SOLDOUT_KEY,
} from './lib/storage.js'
import { now, fmtAgo, fmtClock, getOpenMeals, getNextMeals } from './lib/time.js'
import TeamSetup from './components/TeamSetup.jsx'
import MenuBoard from './components/MenuBoard.jsx'
import CallSection from './components/CallSection.jsx'
import TeamInfoSheet from './components/TeamInfoSheet.jsx'

// 이 기기가 어느 팀인지 기억합니다. 행사 중 창을 닫거나 새로고침해도 다시
// 등록하지 않도록 — 팀 등록은 행사 시작 때 한 번만 하면 됩니다.
const MY_TEAM_KEY = 'torder-my-team'

export default function App() {
  const [team, setTeam] = useState(null)
  const [editingTeam, setEditingTeam] = useState(false)
  const [showTeamInfo, setShowTeamInfo] = useState(false)
  // 저장된 팀을 확인하는 중 — 등록 화면이 잠깐 스쳤다 사라지는 것을 막습니다
  const [restoring, setRestoring] = useState(true)
  // 서버에 기록이 없을 때(초기화 등) 등록 화면에 채워줄 값
  const [prefill, setPrefill] = useState(null)

  // 화면 하단 탭: 'order'(음식 주문) | 'call'(마스터 메이트 호출)
  // 현재 주문 가능한 식사가 있을 때만 음식 주문 탭으로 랜딩
  const [tab, setTab] = useState(() =>
    getOpenMeals(now().getTime()).length > 0 ? 'order' : 'call',
  )

  // 1초 틱: 카운트다운/시간대 전환용
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // 공유 저장소에서 읽어온 상태
  const [savedOrder, setSavedOrder] = useState(null)
  // 저장 직전에 "화면이 알고 있던 주문"을 비교하려면 최신 값이 필요합니다
  // (state는 클로저에 묶여 옛 값이 잡힐 수 있어 ref로 함께 보관)
  const savedOrderRef = useRef(null)
  const [callData, setCallData] = useState(null)
  const [callCount, setCallCount] = useState(0)
  const [soldout, setSoldout] = useState({})
  const [lastSync, setLastSync] = useState(null)
  const [syncError, setSyncError] = useState(false)
  const refreshRunning = useRef(false)

  const teamId = team?.teamId || null

  // ---- 저장된 팀으로 자동 입장 ----
  // 서버 기록을 확인해서 들어갑니다. 다른 팀원이 팀 정보를 고쳤을 수 있어
  // 로컬 사본보다 서버 기록을 우선합니다.
  useEffect(() => {
    let alive = true
    const run = async () => {
      let stored = null
      try {
        stored = JSON.parse(window.localStorage.getItem(MY_TEAM_KEY) || 'null')
      } catch {
        stored = null
      }
      if (!stored?.teamId) {
        if (alive) setRestoring(false)
        return
      }
      let server
      let reachable = true
      try {
        server = await storageGet(teamKey(stored.teamId))
      } catch {
        reachable = false // 통신 실패 — 있는지 없는지 알 수 없음
      }
      if (!alive) return
      if (server || !reachable) {
        // 목록에 빠져 있으면 관리자 화면에서 이 팀이 안 보이므로, 들어올 때마다
        // 한 번 더 넣어둡니다 (서버가 중복을 걸러내므로 여러 번 불러도 안전)
        rosterAddTeam(stored.teamId).catch(() => {})
        setTeam(server || stored)
        setTab(getOpenMeals(now().getTime()).length > 0 ? 'order' : 'call')
      } else {
        // 서버에 기록이 없음(행사 전 초기화 등) → 저장값을 채운 등록 화면
        setPrefill(stored)
      }
      setRestoring(false)
    }
    run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(async () => {
    if (!teamId) return
    if (refreshRunning.current) return
    refreshRunning.current = true
    try {
      const [order, call, count, sold] = await storageGetMany([
        orderKey(teamId),
        callKey(teamId),
        callCountKey(teamId),
        SOLDOUT_KEY,
      ])
      setSavedOrder(order)
      savedOrderRef.current = order
      setCallData(call)
      setCallCount(typeof count === 'number' ? count : 0)
      setSoldout(sold || {})
      setLastSync(now())
      setSyncError(false)
    } catch {
      setSyncError(true)
    } finally {
      refreshRunning.current = false
    }
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    let stopped = false
    let timer
    const run = async () => {
      await refresh()
      if (!stopped) timer = window.setTimeout(run, PARTICIPANT_POLL_MS + Math.random() * 1000)
    }
    run()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [teamId, refresh])

  // 팀 정보 저장: 공유 저장소(team:{id}) + 팀 로스터 등록 + 로컬 캐시
  const saveTeam = useCallback(async (t) => {
    const record = { ...t, updatedAt: now().getTime() }
    await storageSet(teamKey(t.teamId), record)
    // 팀 목록 추가는 서버에서 원자적으로. 앱에서 읽고-고쳐-쓰면 같은 순간에
    // 등록한 다른 팀의 번호를 지워버려, 그 팀이 관리자 화면에서 사라집니다.
    await rosterAddTeam(t.teamId)
    try {
      window.localStorage.setItem(MY_TEAM_KEY, JSON.stringify(record))
    } catch {
      /* 저장 공간 거부(시크릿 모드 등) — 이번 세션에서는 그대로 진행 */
    }
    setTeam(record)
    setPrefill(null)
    setEditingTeam(false)
    setTab(getOpenMeals(now().getTime()).length > 0 ? 'order' : 'call')
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }, [])

  const lookupTeam = useCallback(async (id) => {
    try {
      return await storageGet(teamKey(id))
    } catch {
      return null
    }
  }, [])

  const closeTeamInfo = useCallback(() => setShowTeamInfo(false), [])
  const editTeamInfo = useCallback(() => {
    setShowTeamInfo(false)
    setEditingTeam(true)
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }, [])

  // ---- 쓰기 동작 (통신 실패 시 throw → 호출한 컴포넌트가 잡아서 알림) ----
  // 열려 있는 식사들의 주문을 한 번에 저장 (저녁·야식·아침 통합 주문 대응)
  // mealsMap: { mealId: items[] }
  // force: true 면 충돌 확인을 건너뛰고 내 화면 내용으로 저장합니다.
  const saveOrders = useCallback(
    async (mealsMap, { force = false } = {}) => {
      const current = (await storageGet(orderKey(teamId))) || { team: teamId, meals: {} }
      // 같은 팀의 다른 기기가 그 사이에 저장했는지 — 서버 기록이 화면이 알던
      // 것보다 새로우면 덮어쓰기 전에 물어봅니다 (조용히 지워지는 것 방지)
      if (!force) {
        const known = savedOrderRef.current
        const conflicted = Object.keys(mealsMap).some((mealId) => {
          const serverAt = current.meals?.[mealId]?.updatedAt || 0
          const knownAt = known?.meals?.[mealId]?.updatedAt || 0
          return serverAt > knownAt
        })
        if (conflicted) {
          const err = new Error('order-conflict')
          err.code = 'order-conflict'
          throw err
        }
      }
      current.team = teamId
      current.meals = current.meals || {}
      const at = now().getTime()
      Object.entries(mealsMap).forEach(([mealId, items]) => {
        current.meals[mealId] = { items, updatedAt: at }
      })
      await storageSet(orderKey(teamId), current)
      await refresh().catch(() => {})
    },
    [teamId, refresh],
  )

  // 마스터 메이트 호출 — 참가자가 직접 작성한 호출 사유(reason)를 함께 전달.
  // 관리자 앱 CallsTab에서 이 사유를 호출 알림과 함께 확인합니다.
  // 담당 메이트 이름·슬랙 ID도 함께 저장합니다. 공유 API 서버가 슬랙 알림을
  // 보낼 때 쓰는데, 서버는 config를 모르기 때문에 앱이 값을 실어보냅니다.
  const sendCall = useCallback(
    async (reason) => {
      const assigned = getAssignedCoachForTeam(teamId)
      // 호출 추가 + 횟수 증가 + 제한 검사를 서버가 한 번에 처리합니다.
      // 예전에는 두 번 나눠 써서, 둘째가 실패하면 "전송 실패"라고 안내하면서
      // 실제로는 호출이 들어가 중복이 생겼습니다.
      await callAdd(teamId, {
        id: `${teamId}-${now().getTime()}-${Math.floor(Math.random() * 1e6)}`,
        status: 'waiting',
        createdAt: now().getTime(),
        reason: (reason || '').trim(),
        assignedName: assigned?.name || '',
        assignedSlackId: assigned?.slackUserId || '',
      })
      await refresh().catch(() => {})
    },
    [teamId, refresh],
  )

  // 내 호출 상태 변화(대기중→처리중→완료) 감지 → 진동 알림
  const prevCallRef = useRef(null)
  useEffect(() => {
    const calls = callData?.calls || []
    const latest = calls[calls.length - 1]
    const sig = latest ? `${latest.id}:${latest.status}` : null
    const prev = prevCallRef.current
    if (prev && sig && prev !== sig && prev.split(':')[0] === latest.id) {
      navigator.vibrate?.([200, 100, 200])
    }
    prevCallRef.current = sig
  }, [callData])

  // 시간대별 다크모드 (config.DARK_MODE_HOURS)
  const hour = now().getHours()
  const { start: darkStart, end: darkEnd } = DARK_MODE_HOURS
  const isDark =
    darkStart > darkEnd ? hour >= darkStart || hour < darkEnd : hour >= darkStart && hour < darkEnd
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  // 저장된 팀을 확인하는 사이에는 아무것도 보여주지 않습니다
  // (등록 화면이 깜빡였다 사라지면 새로 등록해야 하나 오해하게 됩니다)
  if (restoring) {
    return <div className="app boot-wait" aria-busy="true" />
  }

  // 팀 미설정 또는 수정 중 → 온보딩 화면
  if (!team || editingTeam) {
    return (
      <TeamSetup
        initial={editingTeam ? team : prefill}
        existingLookup={lookupTeam}
        onComplete={saveTeam}
      />
    )
  }

  const t = now().getTime()
  const openMeals = getOpenMeals(t)
  const nextMeals = getNextMeals(t)
  const hasActiveCall = (callData?.calls || []).some((c) => c.status !== 'done')

  return (
    <div className={`app${tab === 'order' && openMeals.length ? ' has-sticky-bar' : ''}`}>
      {syncError && (
        <div className="sync-error" role="status">
          <span>
            ⚠️ 서버 연결 오류 — 최신 정보가 아닐 수 있습니다.
            <small>
              {lastSync
                ? `마지막 정상 동기화: ${fmtAgo(now().getTime() - lastSync.getTime())}`
                : '아직 정상 동기화 기록이 없습니다.'}
            </small>
          </span>
          <button type="button" onClick={refresh}>지금 재시도</button>
        </div>
      )}

      <div className="folder">
        <div className="folder-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'call'}
            className={`folder-tab${tab === 'call' ? ' active' : ''}`}
            onClick={() => setTab('call')}
          >
            🙋 마스터 메이트 호출
            {hasActiveCall && <span className="p-tab-dot" />}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'order'}
            className={`folder-tab${tab === 'order' ? ' active' : ''}`}
            onClick={() => setTab('order')}
          >
            🍽️ 음식 주문
          </button>
          <div className="folder-team">
            <button
              className="team-profile-btn"
              onClick={() => setShowTeamInfo(true)}
              aria-haspopup="dialog"
              aria-label={`팀 ${team.teamId} 정보 보기`}
            >
              <span className="team-profile-avatar" aria-hidden="true">👥</span>
              <span className="team-profile-label">팀 {team.teamId}</span>
              <span className="team-profile-chevron" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
        <div className="folder-body">
          {tab === 'order' ? (
            <MenuBoard
              openMeals={openMeals}
              nextMeals={nextMeals}
              soldout={soldout}
              savedOrder={savedOrder}
              memberCount={team.memberCount}
              allergies={team.allergies}
              onRefresh={refresh}
              onSave={saveOrders}
            />
          ) : (
            <CallSection
              callData={callData}
              callCount={callCount}
              assignedCoachName={getAssignedCoachForTeam(team.teamId)?.name || null}
              onCall={sendCall}
            />
          )}
        </div>
      </div>

      {lastSync && (
        <div className="sync-footer">마지막 동기화 {fmtClock(lastSync)} · 자동 갱신 중</div>
      )}

      {showTeamInfo && (
        <TeamInfoSheet team={team} onClose={closeTeamInfo} onEdit={editTeamInfo} />
      )}
    </div>
  )
}
