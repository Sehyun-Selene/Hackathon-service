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
import { now, fmtClock, getOpenMeal, getNextMeal, getVisibleMeals } from './lib/time.js'
import TeamSetup from './components/TeamSetup.jsx'
import GuideSection from './components/GuideSection.jsx'
import MenuBoard from './components/MenuBoard.jsx'
import OrderHistory from './components/OrderHistory.jsx'
import CallSection from './components/CallSection.jsx'

const MY_TEAM_KEY = 'torder-my-team' // 이 기기가 속한 팀 정보(로컬 캐시)

export default function App() {
  // 이 기기의 팀 정보 (온보딩에서 설정, 로컬에 캐시)
  const [team, setTeam] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(MY_TEAM_KEY) || 'null')
    } catch {
      return null
    }
  })
  const [editingTeam, setEditingTeam] = useState(false)

  // 화면 하단 탭: 'order'(음식 주문) | 'call'(코치 호출)
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
    window.localStorage.setItem(MY_TEAM_KEY, JSON.stringify(record))
    setTeam(record)
    setEditingTeam(false)
  }, [])

  const lookupTeam = useCallback(async (id) => {
    try {
      return await storageGet(teamKey(id))
    } catch {
      return null
    }
  }, [])

  // ---- 쓰기 동작 (통신 실패 시 throw → 호출한 컴포넌트가 잡아서 알림) ----
  const saveOrder = useCallback(
    async (mealId, items) => {
      const current = (await storageGet(orderKey(teamId))) || { team: teamId, meals: {} }
      current.team = teamId
      current.meals = current.meals || {}
      current.meals[mealId] = { items, updatedAt: now().getTime() }
      await storageSet(orderKey(teamId), current)
      await refresh().catch(() => {})
    },
    [teamId, refresh],
  )

  const sendCall = useCallback(
    async (reason) => {
      const current = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
      current.calls = current.calls || []
      current.calls.push({
        id: `${teamId}-${now().getTime()}-${Math.floor(Math.random() * 1e6)}`,
        reason,
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
  const openMeal = getOpenMeal(t)
  const nextMeal = getNextMeal(t)
  const visibleMeals = getVisibleMeals(t)
  const hasActiveCall = (callData?.calls || []).some((c) => c.status !== 'done')

  return (
    <div className={`app${tab === 'order' && openMeal ? ' has-sticky-bar' : ''}`}>
      <header className="header">
        <div>
          <div className="header-table">팀 {team.teamId}</div>
          <div className="header-sub">{team.memberCount}명</div>
        </div>
        <div className="header-right">
          <div className="header-clock">{fmtClock(now())}</div>
          <div className="header-btns">
            <button className="btn-ghost" onClick={() => setEditingTeam(true)}>
              팀 정보
            </button>
            <button className="btn-ghost" onClick={refresh}>
              ⟳
            </button>
          </div>
        </div>
      </header>

      {syncError && (
        <div className="sync-error">
          ⚠️ 서버 연결 오류 — 최신 정보가 아닐 수 있습니다. 자동으로 재시도 중입니다.
        </div>
      )}

      <nav className="p-tabs">
        <button
          className={`p-tab${tab === 'order' ? ' active' : ''}`}
          onClick={() => setTab('order')}
        >
          🍽️ 음식 주문
        </button>
        <button
          className={`p-tab${tab === 'call' ? ' active' : ''}`}
          onClick={() => setTab('call')}
        >
          🙋 코치 호출
          {hasActiveCall && <span className="p-tab-dot" />}
        </button>
      </nav>

      {tab === 'order' ? (
        <>
          <GuideSection />
          <MenuBoard
            openMeal={openMeal}
            nextMeal={nextMeal}
            soldout={soldout}
            savedOrder={savedOrder}
            memberCount={team.memberCount}
            onSave={saveOrder}
          />
          <OrderHistory visibleMeals={visibleMeals} openMeal={openMeal} savedOrder={savedOrder} />
        </>
      ) : (
        <CallSection
          callData={callData}
          callCount={callCount}
          assignedCoachName={getAssignedCoachForTeam(team.teamId)?.name || null}
          onCall={sendCall}
        />
      )}

      {lastSync && (
        <div className="sync-footer">마지막 동기화 {fmtClock(lastSync)} · 자동 갱신 중</div>
      )}
    </div>
  )
}
