import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PARTICIPANT_POLL_MS,
  DARK_MODE_HOURS,
  getAssignedCoachesForTeam,
  coachGroupForTeam,
  leagueAllowsCall,
  imageBoardsFor,
} from './config.js'
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
  NUDGE_KEY,
  fetchStock,
  orderSave,
} from './lib/storage.js'
import { now, fmtAgo, fmtClock, fmtCountdown, getOpenMeals, getNextMeals } from './lib/time.js'
import TeamSetup from './components/TeamSetup.jsx'
import MenuBoard from './components/MenuBoard.jsx'
import ImageBoard from './components/ImageBoard.jsx'
import CallSection from './components/CallSection.jsx'
import TeamInfoSheet from './components/TeamInfoSheet.jsx'
import LanternIcon from './components/LanternIcon.jsx'
import GuideSheet from './components/GuideSheet.jsx'

// 이 기기가 어느 팀인지 기억합니다. 행사 중 창을 닫거나 새로고침해도 다시
// 등록하지 않도록 — 팀 등록은 행사 시작 때 한 번만 하면 됩니다.
const MY_TEAM_KEY = 'torder-my-team'
// 관리자 재촉 표시의 유효기간 — 오래된 표시로 계속 뜨지 않게
const NUDGE_TTL_MS = 10 * 60 * 1000

export default function App() {
  const [team, setTeam] = useState(null)
  const [editingTeam, setEditingTeam] = useState(false)
  const [showTeamInfo, setShowTeamInfo] = useState(false)
  // 이용 안내 다시 보기 시트 (첫 화면의 안내를 행사 중에 꺼내 봅니다)
  const [showGuide, setShowGuide] = useState(false)
  // 저장된 팀을 확인하는 중 — 등록 화면이 잠깐 스쳤다 사라지는 것을 막습니다
  const [restoring, setRestoring] = useState(true)
  // 서버에 기록이 없을 때(초기화 등) 등록 화면에 채워줄 값
  const [prefill, setPrefill] = useState(null)

  // 화면 하단 탭: 'order'(음식 주문) | 'call'(마스터 메이트 호출)
  // 현재 주문 가능한 식사가 있을 때만 음식 주문 탭으로 랜딩
  const [tab, setTab] = useState(() =>
    getOpenMeals(now().getTime()).length > 0 ? 'order' : 'call',
  )

  // 탭을 옮기면 늘 화면 맨 위에서 시작합니다.
  // 스크롤 위치는 문서 하나에 하나뿐이라, 내려서 보던 상태로 탭을 옮기면
  // 새 화면도 그만큼 내려간 자리에서 열려 제목이 안 보입니다.
  // 프레임을 한 번 기다립니다 — 새 화면이 더 짧으면 브라우저가 스크롤을
  // 스스로 끌어당기는데, 그보다 먼저 옮기면 그 보정에 덮어써집니다.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [tab])

  // 1초 틱: 카운트다운/시간대 전환용
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ---- 담은 메뉴(초안) ----
  // 주문 화면이 아니라 App이 들고 있습니다. 탭을 옮기면 주문 화면이
  // 내려가는데, 그 안에 두면 타임테이블을 잠깐 보고 온 사이에 담아둔
  // 메뉴가 사라집니다. draft: { mealId: { menuId: qty } }
  const [draft, setDraft] = useState({})
  // 아직 '주문하기'를 누르지 않은 변경이 있는지
  const [draftDirty, setDraftDirty] = useState(false)
  // 주문 가능한 끼니가 바뀌면(창이 열리거나 닫히면) 초안은 버립니다 —
  // 닫힌 끼니의 수량을 들고 있으면 다음 창에서 엉뚱하게 되살아납니다.
  const openMealsKey = getOpenMeals(now().getTime())
    .map((m) => m.id)
    .join(',')
  useEffect(() => {
    setDraft({})
    setDraftDirty(false)
  }, [openMealsKey])

  // 공유 저장소에서 읽어온 상태
  const [savedOrder, setSavedOrder] = useState(null)
  // 저장 직전에 "화면이 알고 있던 주문"을 비교하려면 최신 값이 필요합니다
  // (state는 클로저에 묶여 옛 값이 잡힐 수 있어 ref로 함께 보관)
  const savedOrderRef = useRef(null)
  const [callData, setCallData] = useState(null)
  const [callCount, setCallCount] = useState(0)
  // 메뉴별 남은 수량 (서버가 전 팀 주문을 합쳐 계산). 0이면 그 메뉴는 닫힙니다.
  const [remaining, setRemaining] = useState({})
  const [soldout, setSoldout] = useState({})
  // 관리자가 누른 '주문해주세요' 재촉 표시 { at, mealId }
  const [nudge, setNudge] = useState(null)
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
      const [[order, call, count, sold, nudgeVal], stock] = await Promise.all([
        storageGetMany([
          orderKey(teamId),
          callKey(teamId),
          callCountKey(teamId),
          SOLDOUT_KEY,
          NUDGE_KEY,
        ]),
        // 남은 수량은 저장된 키가 아니라 서버가 계산해 주는 값이라 따로 읽습니다
        fetchStock().catch(() => null),
      ])
      setSavedOrder(order)
      savedOrderRef.current = order
      setCallData(call)
      setCallCount(typeof count === 'number' ? count : 0)
      setSoldout(sold || {})
      setNudge(nudgeVal || null)
      // 통신이 한 번 실패해도 이전 값을 지우지 않습니다 — 남은 수량이 갑자기
      // 비면 다 닫혀 있던 메뉴가 열린 것처럼 보입니다
      if (stock?.remaining) setRemaining(stock.remaining)
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
  const closeGuide = useCallback(() => setShowGuide(false), [])
  // 팀 정보 시트를 닫고 안내 시트를 엽니다 — 시트를 두 장 겹쳐 띄우면
  // 뒤 시트가 스크롤을 잡아 닫기 버튼을 누르기 어려워집니다.
  const openGuide = useCallback(() => {
    setShowTeamInfo(false)
    setShowGuide(true)
  }, [])
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
      // 준비 수량을 넘기면 서버가 거절합니다 (err.code === 'stock').
      // 예전 서버(엔드포인트 없음)에서는 종전처럼 그대로 저장합니다.
      try {
        await orderSave(teamId, mealsMap)
      } catch (err) {
        if (err?.code !== 'endpoint-missing') throw err
        await storageSet(orderKey(teamId), current)
      }
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
      // 담당은 한 명일 수도, 그룹(리테일 조)일 수도 있습니다.
      // 그룹이면 구성원 전원을 실어보내 전원이 알림을 받습니다 —
      // 누가 갈지 정해두지 않는 것이 그룹 배정의 취지입니다.
      const assigned = getAssignedCoachesForTeam(teamId)
      const group = coachGroupForTeam(teamId)
      // 호출 추가 + 횟수 증가 + 제한 검사를 서버가 한 번에 처리합니다.
      // 예전에는 두 번 나눠 써서, 둘째가 실패하면 "전송 실패"라고 안내하면서
      // 실제로는 호출이 들어가 중복이 생겼습니다.
      await callAdd(teamId, {
        id: `${teamId}-${now().getTime()}-${Math.floor(Math.random() * 1e6)}`,
        status: 'waiting',
        createdAt: now().getTime(),
        reason: (reason || '').trim(),
        assignedName: group ? group.label + ' 마스터 메이트' : assigned[0]?.name || '',
        // 예전 서버는 하나만 읽습니다 — 둘 다 실어 보내 어느 쪽이든 동작하게
        assignedSlackId: assigned[0]?.slackUserId || '',
        assignedSlackIds: assigned.map((c) => c.slackUserId).filter(Boolean),
      })
      await refresh().catch(() => {})
    },
    [teamId, refresh],
  )

  // 관리자 재촉이 처음 도착했을 때 한 번 진동 — 화면을 보고 있지 않을 수도
  // 있으므로. 훅이므로 조기 반환보다 반드시 위에 있어야 합니다.
  const buzzedRef = useRef(null)
  useEffect(() => {
    if (!nudge?.at) return
    if (Date.now() - nudge.at >= NUDGE_TTL_MS) return
    const open = getOpenMeals(now().getTime())
    if (!open.length) return
    const ordered = open.some((m) => (savedOrder?.meals?.[m.id]?.items || []).length > 0)
    if (ordered) return
    if (buzzedRef.current === nudge.at) return
    buzzedRef.current = nudge.at
    navigator.vibrate?.([120, 80, 120])
  }, [nudge?.at, savedOrder])

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
    // 디자인 토큰(plai-order-tokens.css)은 data-po-theme 로 낮/밤을 가립니다.
    // OS 설정이 아니라 이 앱의 시각 판단을 따르게 하려고 함께 세웁니다.
    document.documentElement.dataset.poTheme = isDark ? 'dark' : 'light'
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
        // 편집으로 들어왔을 때만 돌아갈 길을 줍니다. 처음 등록은 팀 정보가
        // 없으면 아무것도 못 하는 화면이라 취소할 곳이 없습니다.
        onCancel={editingTeam ? () => setEditingTeam(false) : null}
      />
    )
  }

  const t = now().getTime()
  const openMeals = getOpenMeals(t)
  const nextMeals = getNextMeals(t)
  const hasActiveCall = (callData?.calls || []).some((c) => c.status !== 'done')
  // 개발자리그는 마스터 메이트 호출을 쓰지 않습니다 (config의 리그별 calls)
  const canCall = leagueAllowsCall(team.teamId)

  // ── 관리자 재촉 배너 (판단만 — 훅은 아래 조기 반환보다 위에 있습니다) ──
  // 주문 탭 안이 아니라 탭 밖에서 그립니다. 호출 탭을 보고 있는 참가자도
  // 봐야 하기 때문입니다 — 재촉의 목적이 '닿는 것'이라서요.
  const nudgeFresh = !!nudge?.at && Date.now() - nudge.at < NUDGE_TTL_MS
  const orderedOpenMeal = openMeals.some(
    (m) => (savedOrder?.meals?.[m.id]?.items || []).length > 0,
  )
  // 주문 창이 열려 있고, 아직 주문하지 않은 팀에만
  const showNudge = nudgeFresh && openMeals.length > 0 && !orderedOpenMeal
  const nudgeRemain = openMeals.length
    ? new Date(openMeals[0].orderEnd).getTime() - now().getTime()
    : 0

  // ── 탭 목록 ──────────────────────────────────────────────────
  // 리그에 따라 개수가 다릅니다: 필드리그 4개(호출·주문·타임테이블·음식
  // 여정), 개발자리그 2개(주문·음식 여정 — 호출을 쓰지 않으므로).
  // 탭 글자는 짧게 씁니다. 폰에서 네 개가 한 줄에 들어가야 하고, 펼친
  // 화면에는 전체 제목이 다시 나오기 때문입니다.
  const boards = imageBoardsFor(team.teamId)
  const tabs = [
    ...(canCall ? [{ id: 'call', label: '호출', logo: './logo-call.png' }] : []),
    { id: 'order', label: '주문', logo: './logo-order.png' },
    ...boards.map((b) => ({ id: b.id, label: b.label, icon: b.icon })),
  ]
  // 고른 탭이 이미지 탭이면 그 정의를 넘겨줍니다
  const board = boards.find((b) => b.id === tab) || null

  // 팀 프로필 버튼 — 어느 탭에 있든 그 화면 제목 옆에 놓습니다.
  // 탭 줄에 함께 두던 때는 탭이 네 개가 되면서 버튼이 잘렸습니다.
  // 같은 버튼이라 한 곳에서 만들어 각 화면에 넘겨줍니다.
  const teamButton = (
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
  )

  // 담아둔 채 다른 탭으로 옮겼을 때 띄우는 플로팅 장바구니.
  // 이미 주문이 들어간 수량은 알림거리가 아니므로, 저장되지 않은 변경이
  // 남아 있을 때(draftDirty)만 띄웁니다.
  const draftTotal = openMeals.reduce(
    (sum, m) => sum + Object.values(draft[m.id] || {}).reduce((s, q) => s + q, 0),
    0,
  )
  const showDraftChip = tab !== 'order' && openMeals.length > 0 && draftDirty && draftTotal > 0

  return (
    <div
      className={`app app-main${
        tab === 'order' && openMeals.length ? ' has-sticky-bar' : ''
      }${showDraftChip ? ' has-draft-chip' : ''}`}
    >
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

      {/* 서비스 이름은 어느 화면에서든 같은 자리에 있어야 합니다. 팀 등록·
          이용 안내 화면은 제 헤더에 워드마크를 갖고 있는데, 들어온 뒤 화면들은
          없어서 "여기가 어느 앱이지"가 화면마다 달랐습니다. 화면마다 넣지 않고
          여기 한 번만 둡니다 — 탭을 옮겨도 자리가 그대로입니다. */}
      <div className="app-brand">
        <LanternIcon state="active" size={16} className="app-brand-lantern" />
        G-Order
      </div>

      <div className="folder">
        {/* 탭은 둘 이상일 때만 그립니다. 개발자리그는 호출이 없어
            주문 + 음식 여정 두 개이고, 필드리그는 네 개입니다.
            탭이 하나뿐이면 줄을 없애고 팀 버튼을 제목 옆으로 내려보냅니다.
            폰에서 네 개가 한 줄에 들어가도록 글자를 짧게 씁니다 — 펼친
            화면에는 전체 제목이 다시 나옵니다. */}
        {tabs.length > 1 && (
          <div className="folder-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`folder-tab${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.logo ? (
                  <img className="folder-tab-logo" src={t.logo} alt="" />
                ) : (
                  <span className="folder-tab-icon" aria-hidden="true">
                    {t.icon}
                  </span>
                )}
                {t.label}
                {t.id === 'call' && hasActiveCall && <span className="p-tab-dot" />}
              </button>
            ))}
          </div>
        )}
        <div className="folder-body">
          {/* 눌러서 바로 주문 탭으로 — 알림을 보고 어디로 가야 할지 찾게 두지
              않습니다 */}
          {showNudge && (
            <button className="nudge-banner" onClick={() => setTab('order')}>
              <span className="nudge-banner-icon" aria-hidden="true">🍽️</span>
              <span className="nudge-banner-text">
                <b>음식을 주문해주세요!</b>
                <span>
                  마감까지 {fmtCountdown(nudgeRemain)} 남았습니다.
                  {tab === 'order' ? ' 지금 메뉴를 담아 주문해주세요.' : ' 눌러서 주문하기'}
                </span>
              </span>
              <span className="nudge-banner-go" aria-hidden="true">
                {tab === 'order' ? '' : '›'}
              </span>
            </button>
          )}
          {board ? (
            <ImageBoard board={board} teamButton={teamButton} />
          ) : tab === 'call' && canCall ? (
            <CallSection
              callData={callData}
              callCount={callCount}
              onCall={sendCall}
              teamButton={teamButton}
            />
          ) : (
            <MenuBoard
              openMeals={openMeals}
              nextMeals={nextMeals}
              soldout={soldout}
              savedOrder={savedOrder}
              memberCount={team.memberCount}
              allergies={team.allergies}
              onRefresh={refresh}
              onSave={saveOrders}
              remaining={remaining}
              canCall={canCall}
              teamButton={teamButton}
              teamId={team.teamId}
              draft={draft}
              setDraft={setDraft}
              dirty={draftDirty}
              setDirty={setDraftDirty}
            />
          )}
        </div>
      </div>

      {lastSync && (
        <div className="sync-footer">마지막 동기화 {fmtClock(lastSync)} · 자동 갱신 중</div>
      )}

      {showTeamInfo && (
        <TeamInfoSheet
          team={team}
          onClose={closeTeamInfo}
          onEdit={editTeamInfo}
          onGuide={openGuide}
        />
      )}

      {showGuide && (
        <GuideSheet showCall={canCall} onClose={closeGuide} />
      )}

      {/* 다른 탭에 있는 동안 담아둔 메뉴를 잊지 않도록 — 담기만 하고
          '주문하기'를 누르지 않으면 마감과 함께 그대로 사라집니다.
          눌러서 주문 화면으로 바로 돌아갑니다. */}
      {showDraftChip && (
        <button className="draft-chip" onClick={() => setTab('order')}>
          <span className="draft-chip-icon" aria-hidden="true">🛒</span>
          <span className="draft-chip-text">
            <b>
              담은 메뉴 <span className="po-num">{draftTotal}</span>개
            </b>
            <small>아직 주문 전이에요</small>
          </span>
          <span className="draft-chip-go" aria-hidden="true">›</span>
        </button>
      )}

      <nav className="app-nav" aria-label="주요 메뉴">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`app-nav-item${tab === t.id ? ' active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.logo ? (
              <img src={t.logo} alt="" />
            ) : (
              <span className="app-nav-emoji" aria-hidden="true">{t.icon}</span>
            )}
            <span>{t.label}</span>
            {t.id === 'call' && hasActiveCall && <i className="app-nav-dot" />}
          </button>
        ))}
      </nav>
    </div>
  )
}
