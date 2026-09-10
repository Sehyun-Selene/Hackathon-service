import { useMemo, useState } from 'react'
import {
  formatTeamRange,
  teamSortKey,
  crewFor,
  getAssignedCoachForTeam,
  COACH_GROUPS,
  crewLabel,
  crewRoleLabel,
  resolveCrewId,
} from '../config.js'
import { fmtTimeOnly } from '../lib/time.js'
import Icon from './Icon.jsx'
import AdminDock from './AdminDock.jsx'
import { useMediaQuery } from '../lib/useMediaQuery.js'

// 마스터 메이트 현황 (PRD 요청 #5): 위치 지도 대신, 마스터 메이트 개인별 리스트를 한눈에.
// 목적: 특정 마스터 메이트가 바쁘면(대응 중이면) 다른 마스터 메이트가 그 담당 팀
// 호출을 대신 볼 수 있게.
//
// 40명 규모에서는 한 목록에 전부 쌓으면 "지금 누가 비었나"를 찾기 어려우므로
// 대기 중 / 대응 중으로 나눠 봅니다. 세 칸짜리 필터가 곧 요약이라, 같은 숫자를
// 위에 한 번 더 적지 않습니다.
export default function CoachStatusTab({
  scan,
  coach,
  onOpenMenu,
  menuAlert,
  menuOpen,
  syncAt,
  onRefresh,
  refreshing,
}) {
  const wide = useMediaQuery('(min-width: 900px)')
  const [filter, setFilter] = useState('idle') // idle | busy | all
  // 'range' = 담당 구간순(기본) / 'calls' = 호출 많은 순.
  // 부하가 한쪽으로 쏠렸는지는 구간 순서로는 보이지 않습니다.
  const [sort, setSort] = useState('range')

  // 진행 중(in_progress) 호출을 담당자별로 매핑.
  // 이름과 기기 id 양쪽으로 담아둡니다 — 신원 단위는 이름이지만, 이름이 없는
  // 옛 기록은 기기 id로만 찾을 수 있습니다.
  const busyByKey = useMemo(() => {
    const map = {}
    const push = (key, teamId) => {
      if (!key) return
      map[key] = map[key] || []
      map[key].push({ teamId })
    }
    Object.entries(scan.calls).forEach(([teamId, data]) => {
      ;(data.calls || []).forEach((c) => {
        if (c.status !== 'in_progress') return
        if (c.handledBy) push('name:' + c.handledBy, teamId)
        else push('id:' + c.handledById, teamId)
      })
    })
    return map
  }, [scan.calls])

  // 담당 구간에 아직 처리되지 않은 호출 수.
  //
  // 누적(완료 포함)이 아니라 아직 아무도 잡지 않은 것만 셉니다. 이 화면에서
  // 내리는 결정은 "지금 손이 빈 사람을 어디로 보낼까" 하나뿐이라, 끝난 일은
  // 그 판단을 돕지 않습니다. 누가 얼마나 처리했는지는 호출 알림 탭에 있습니다.
  //
  // 이름에 waiting 을 쓰지 않습니다 — 이 화면에서 "대기"는 메이트가 쉬고
  // 있다는 뜻으로만 씁니다. 같은 말이 두 뜻이면 화면에서도 코드에서도
  // 잘못 읽힙니다.
  const openCallsByTeam = useMemo(() => {
    const map = {}
    Object.entries(scan.calls).forEach(([teamId, data]) => {
      map[teamId] = (data.calls || []).filter((c) => c.status === 'waiting').length
    })
    return map
  }, [scan.calls])

  // 담당 팀 번호(가장 작은 번호) 기준 정렬. 미배정은 뒤로.
  //
  // 입장 기록은 기기 단위입니다. 한 사람이 폰과 노트북에서 열면 두 줄이 되어
  // 인원이 부풀고, 한쪽만 대응 중으로 잡히면 같은 사람이 대기·대응에 동시에
  // 뜹니다. 그래서 이름으로 묶고, 그 사람의 어느 기기든 대응 중이면 대응 중으로
  // 봅니다.
  const people = useMemo(() => {
    // 한 사람이 폰·노트북 두 대로 열 수 있어 사람 단위로 묶습니다.
    // 묶는 열쇠는 명단 id — 이름이 같은 두 분(이상윤)이 한 사람으로
    // 합쳐지지 않게 합니다. 명단에 없는 이름은 이름으로 묶습니다.
    const byName = new Map()
    scan.coaches.forEach((c) => {
      const key = resolveCrewId(c) || 'name:' + c.name
      const entry = byName.get(key) || { name: c.name, crewId: c.crewId, ids: [] }
      entry.ids.push(c.id)
      byName.set(key, entry)
    })
    return [...byName.values()]
      // 호출을 받고 뛰는 사람만 셉니다. 총관리자와 식음 운영은 이 앱을
      // 쓰지만 호출 알림을 받고 팀으로 출동하지는 않습니다 — 목록에 섞이면
      // "지금 부를 수 있는 사람" 수가 실제보다 부풀고, 대기 많은 순 맨 위에
      // 갈 수 없는 사람이 올라옵니다.
      .filter((person) => {
        const c = crewFor(person)
        return !c?.callManager && !c?.orderManager
      })
      .map((person) => {
        const assigned = crewFor(person)
        const teams = assigned?.teamNumbers || []
        const label = crewLabel(assigned) || person.name
        return {
          coach: { id: person.ids[0], name: label },
          ids: person.ids,
          groupId: assigned?.groupId || null,
          openCalls: teams.reduce((n, id) => n + (openCallsByTeam[id] || 0), 0),
          busy: [
            ...(busyByKey['name:' + person.name] || []),
            ...person.ids.flatMap((id) => busyByKey['id:' + id] || []),
          ],
          range: formatTeamRange(teams),
          // 아직 담당 구간을 못 받은 분도 목록에는 남깁니다 — 손이 비어 있는
          // 사람이라, 다른 구간을 메우러 갈 수 있습니다
          roleLabel: crewRoleLabel(assigned),
          initial: (label || '?').trim().charAt(0),
          sortKey: teams.length ? Math.min(...teams.map(teamSortKey)) : Number.MAX_SAFE_INTEGER,
        }
      })
  }, [scan.coaches, busyByKey, openCallsByTeam])

  // 인원수는 사람 단위로 셉니다 — 그룹을 한 줄로 접어도 "지금 부를 수 있는
  // 사람"은 사람 수라야 맞습니다.
  const idle = people.filter((r) => r.busy.length === 0)
  const busy = people.filter((r) => r.busy.length > 0)

  // 화면에 그릴 줄. 한 구간을 여럿이 함께 맡는 그룹(리테일 조)은 한 줄로
  // 접습니다. 구성원 13명이 같은 구간을 보므로 호출 수가 전부 같은데,
  // 그대로 펼치면 같은 숫자가 13줄 늘어서서 "왜 다 똑같지?"가 됩니다.
  const rows = useMemo(() => {
    const out = []
    const groups = new Map()
    people.forEach((p) => {
      if (!p.groupId) return out.push(p)
      const g = groups.get(p.groupId) || []
      g.push(p)
      groups.set(p.groupId, g)
    })
    groups.forEach((members, id) => {
      const def = COACH_GROUPS.find((x) => x.id === id)
      const idleN = members.filter((m) => m.busy.length === 0).length
      const teams = def?.teamNumbers || []
      out.push({
        isGroup: true,
        coach: { id: 'group:' + id, name: (def?.label || '') + ' 마스터 메이트' },
        ids: members.flatMap((m) => m.ids),
        openCalls: members[0]?.openCalls ?? 0,
        busy: members.flatMap((m) => m.busy),
        idleN,
        busyN: members.length - idleN,
        total: members.length,
        range: formatTeamRange(teams),
        initial: (def?.label || '?').charAt(0),
        sortKey: teams.length ? Math.min(...teams.map(teamSortKey)) : Number.MAX_SAFE_INTEGER,
      })
    })
    return out
  }, [people])

  const myAssignment = crewFor(coach)
  const myTeams = myAssignment?.teamNumbers || []
  const totalOpen = Object.values(openCallsByTeam).reduce((n, v) => n + v, 0)
  // 담당자가 아예 없는 팀의 호출 — 아무도 가지 않을 건이라 총관리자가
  // 직접 사람을 붙여야 합니다. 그분 화면에서만 씁니다.
  const unassignedOpen = Object.entries(openCallsByTeam)
    .filter(([teamId]) => !getAssignedCoachForTeam(teamId))
    .reduce((n, [, v]) => n + v, 0)
  const myOpen = myAssignment?.callManager
    ? totalOpen
    : myTeams.reduce((n, id) => n + (openCallsByTeam[id] || 0), 0)

  // 그룹은 안에 한 명이라도 해당하면 남깁니다 — 13명 중 9명이 비어 있으면
  // '대기 중'에 보여야 하고, 4명이 나가 있으면 '대응 중'에도 보여야 합니다.
  // 그래서 그룹 한 줄이 두 필터에 모두 나올 수 있습니다. 맞는 동작입니다.
  const pool = rows.filter((r) => {
    if (filter === 'all') return true
    if (r.isGroup) return filter === 'idle' ? r.idleN > 0 : r.busyN > 0
    return filter === 'idle' ? r.busy.length === 0 : r.busy.length > 0
  })
  const shown = [...pool].sort((a, b) =>
    sort === 'calls'
      ? b.openCalls - a.openCalls || a.sortKey - b.sortKey
      : a.sortKey - b.sortKey || a.coach.name.localeCompare(b.coach.name),
  )

  // 세 칸이 곧 요약입니다 — 대기 몇 명, 대응 몇 명, 전부 몇 명.
  // 색으로도 갈립니다(초록=대기, 붉은=대응). 목록의 아바타 테두리와 같은 규칙.
  const TABS = [
    { id: 'idle', label: '대기 중', count: idle.length, tone: 'idle' },
    { id: 'busy', label: '대응 중', count: busy.length, tone: 'busy' },
    { id: 'all', label: '전체', count: people.length, tone: 'all' },
  ]

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="screen-head-text">
          <h1 className="screen-title">
            <Icon name="users" size={19} className="screen-title-icon" />
            마스터 메이트 현황
          </h1>
          <p className="screen-sub">
            대기 중인 메이트가 다른 담당자의 팀 호출을 대신 받을 수 있습니다
          </p>
        </div>
        <button
          type="button"
          className={`screen-refresh${refreshing ? ' spinning' : ''}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="새로고침"
        >
          <Icon name="refresh" size={19} />
        </button>
      </header>

      <div className={`stat-strip${wide ? ' wide' : ''}`}>
      <div className="stat-card">
        <div className="stat-row">
          <span className="stat">
            {/* '처리하지 않은'이 아니라 '처리되지 않은' — 내 담당만이 아니라
                전체 팀의 호출을 센 숫자라, 누가 안 했다는 말이 아닙니다. */}
            <span className="stat-label">아직 처리되지 않은 호출</span>
            <span className="stat-value">
              {totalOpen}
              <small>건</small>
            </span>
          </span>
          <span className="stat-divide" aria-hidden="true" />
          {/* 담당 구간(E-97~E-99)은 라벨에서 뺐습니다. 자기 구간은 프로필에
              늘 있고, 여기서는 괄호가 길어져 오른쪽이 텅 비었습니다.
              총관리자는 담당 구간이 없어 이 칸이 왼쪽과 같은 숫자가 됐었는데,
              같은 수를 두 번 보여주느니 그분만 볼 수 있는 것을 둡니다. */}
          <span className="stat">
            <span className="stat-label">
              {myAssignment?.callManager ? '담당자 없는 호출' : '내 담당'}
            </span>
            <span className="stat-value accent">
              {myAssignment?.callManager ? unassignedOpen : myOpen}
              <small>건</small>
            </span>
          </span>
        </div>
        <div className="chip-row">
          <button
            type="button"
            className={`filter-chip${sort === 'range' ? ' on' : ''}`}
            onClick={() => setSort('range')}
            aria-pressed={sort === 'range'}
          >
            담당 구간순
          </button>
          <button
            type="button"
            className={`filter-chip${sort === 'calls' ? ' on' : ''}`}
            onClick={() => setSort('calls')}
            aria-pressed={sort === 'calls'}
          >
            호출 많은 순
          </button>
        </div>
      </div>

      <div className="tile-row">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tile tone-${t.tone}${filter === t.id ? ' on' : ''}`}
            onClick={() => setFilter(t.id)}
            aria-pressed={filter === t.id}
          >
            <b>{t.count}</b>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      </div>

      <div className="mate-list">
        {people.length === 0 ? (
          <p className="empty-text">아직 입장한 마스터 메이트가 없습니다.</p>
        ) : shown.length === 0 ? (
          <p className="empty-text">
            {filter === 'idle'
              ? '지금 대기 중인 마스터 메이트가 없습니다.'
              : '지금 대응 중인 마스터 메이트가 없습니다.'}
          </p>
        ) : (
          shown.map((m) => {
            // 내 기기가 그 사람의 기기 목록에 있으면 '나'
            const isMe = m.ids.includes(coach.id) || (!m.isGroup && m.coach.name.startsWith(coach.name))
            // 그룹은 한 명이라도 나가 있으면 붉게 — 다 비어 있을 때만 초록입니다
            const isBusy = m.busy.length > 0
            return (
              <div
                key={m.coach.id}
                className={`mate-row${isBusy ? ' busy' : ' idle'}${m.isGroup ? ' group' : ''}`}
              >
                <span className="mate-avatar" aria-hidden="true">{m.initial}</span>
                <span className="mate-body">
                  <span className="mate-line">
                    <b className="mate-name">{m.coach.name}</b>
                    {m.isGroup && <span className="mate-count">{m.total}명</span>}
                    {isMe && <span className="mate-me">나</span>}
                  </span>
                  <span className="mate-range">
                    {m.isGroup
                      ? `팀 ${m.range} · 대기 ${m.idleN} · 대응 ${m.busyN}`
                      : m.range
                        ? `팀 ${m.range}`
                        : m.roleLabel || '담당 미배정'}
                  </span>
                </span>
                {/* '대기'는 이 화면에서 사람이 쉬고 있다는 뜻으로만 씁니다.
                    처리되지 않은 호출은 "호출 N건" — 같은 말을 두 뜻으로
                    쓰면 새벽에 잘못 읽습니다. */}
                <span className="mate-right">
                  <span className={`mate-calls${m.openCalls ? ' hot' : ''}`}>
                    <small className="mate-calls-lead">호출</small>
                    {m.openCalls}
                    <small>건</small>
                  </span>
                  {isBusy && (
                    <span className="mate-at">
                      <Icon name="pin" size={13} />
                      {/* 그룹은 여러 명이 흩어져 있어 팀 번호를 전부 적으면
                          줄이 넘칩니다. 두 개까지만 적고 나머지는 셉니다. */}
                      팀 {m.busy.slice(0, 2).map((x) => x.teamId).join(', ')}
                      {m.busy.length > 2 ? ` 외 ${m.busy.length - 2}` : ''}
                    </span>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* 노트북에는 아래 바를 두지 않습니다 — 메뉴가 왼쪽에 늘 보이고,
          갱신 시각은 화면 머리의 새로고침 옆에 이미 있습니다. */}
      {!wide && (
        <AdminDock onOpenMenu={onOpenMenu} menuAlert={menuAlert} menuOpen={menuOpen}>
          <div className="dock-status">
            <Icon name="clock" size={17} />
            <span>{syncAt ? `${fmtTimeOnly(syncAt)} 갱신` : '갱신 대기'}</span>
          </div>
        </AdminDock>
      )}
    </div>
  )
}
