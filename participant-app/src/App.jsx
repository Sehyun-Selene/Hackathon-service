import { useCallback, useEffect, useRef, useState } from 'react'
import { PARTICIPANT_POLL_MS, DARK_MODE_HOURS, getAssignedCoachForTeam } from './config.js'
import {
  storageGet,
  storageGetMany,
  storageSet,
  teamKey,
  orderKey,
  callKey,
  callCountKey,
  TEAM_ROSTER_KEY,
  SOLDOUT_KEY,
} from './lib/storage.js'
import { now, fmtClock, getOpenMeals, getNextMeals } from './lib/time.js'
import TeamSetup from './components/TeamSetup.jsx'
import MenuBoard from './components/MenuBoard.jsx'
import CallSection from './components/CallSection.jsx'
import TeamInfoSheet from './components/TeamInfoSheet.jsx'

export default function App() {
  // 새로고침하거나 다시 접속하면 항상 빈 팀 등록 화면부터 시작합니다.
  const [team, setTeam] = useState(null)
  const [editingTeam, setEditingTeam] = useState(false)
  const [showTeamInfo, setShowTeamInfo] = useState(false)

  // 화면 하단 탭: 'order'(음식 주문) | 'call'(캠프지기 호출)
  const [tab, setTab] = useState('order')

  // 1초 틱: 카운트다운/시간대 전환용
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // 공유 저장소에서 읽어온 상태
  const [savedOrder, setSavedOrder] = useState(null)
  const [callData, setCallData] = useState(null)
  const [callCount, setCallCount] = useState(0)
  const [soldout, setSoldout] = useState({})
  const [lastSync, setLastSync] = useState(null)
  const [syncError, setSyncError] = useState(false)

  const teamId = team?.teamId || null

  const refresh = useCallback(async () => {
    if (!teamId) return
    try {
      const [order, call, count, sold] = await storageGetMany([
        orderKey(teamId),
        callKey(teamId),
        callCountKey(teamId),
        SOLDOUT_KEY,
      ])
      setSavedOrder(order)
      setCallData(call)
      setCallCount(typeof count === 'number' ? count : 0)
      setSoldout(sold || {})
      setLastSync(now())
      setSyncError(false)
    } catch {
      setSyncError(true)
    }
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    refresh()
    const id = setInterval(refresh, PARTICIPANT_POLL_MS)
    return () => clearInterval(id)
  }, [teamId, refresh])

  // 팀 정보 저장: 공유 저장소(team:{id}) + 팀 로스터 등록 + 로컬 캐시
  const saveTeam = useCallback(async (t) => {
    const record = { ...t, updatedAt: now().getTime() }
    await storageSet(teamKey(t.teamId), record)
    const roster = (await storageGet(TEAM_ROSTER_KEY)) || { ids: [] }
    if (!roster.ids.includes(t.teamId)) {
      roster.ids.push(t.teamId)
      await storageSet(TEAM_ROSTER_KEY, roster)
    }
    setTeam(record)
    setEditingTeam(false)
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
  const saveOrders = useCallback(
    async (mealsMap) => {
      const current = (await storageGet(orderKey(teamId))) || { team: teamId, meals: {} }
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

  // 캠프지기 호출 — 사유 선택 없음
  const sendCall = useCallback(
    async () => {
      const current = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
      current.calls = current.calls || []
      current.calls.push({
        id: `${teamId}-${now().getTime()}-${Math.floor(Math.random() * 1e6)}`,
        status: 'waiting',
        createdAt: now().getTime(),
        // 기본은 횟수에 포함됨. 관리자가 처리하며 제외로 바꿀 수 있음(관리자 CallsTab)
        countsTowardLimit: true,
      })
      await storageSet(callKey(teamId), current)
      const count = (await storageGet(callCountKey(teamId))) || 0
      await storageSet(callCountKey(teamId), (typeof count === 'number' ? count : 0) + 1)
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

  // 팀 미설정 또는 수정 중 → 온보딩 화면
  if (!team || editingTeam) {
    return (
      <TeamSetup
        initial={editingTeam ? team : null}
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
        <div className="sync-error">
          ⚠️ 서버 연결 오류 — 최신 정보가 아닐 수 있습니다. 자동으로 재시도 중입니다.
        </div>
      )}

      <div className="folder">
        <div className="folder-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'order'}
            className={`folder-tab${tab === 'order' ? ' active' : ''}`}
            onClick={() => setTab('order')}
          >
            🍽️ 음식 주문
          </button>
          <button
            role="tab"
            aria-selected={tab === 'call'}
            className={`folder-tab${tab === 'call' ? ' active' : ''}`}
            onClick={() => setTab('call')}
          >
            🙋 캠프지기 호출
            {hasActiveCall && <span className="p-tab-dot" />}
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
