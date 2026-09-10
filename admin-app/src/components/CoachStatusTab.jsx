import { useMemo, useState } from 'react'
import {
  formatTeamRange,
  teamSortKey,
  crewFor,
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

  // 담당 구간에 "지금" 밀려 있는 호출 수.
  //
  // 누적(완료 포함)이 아니라 대기 중인 것만 셉니다. 이 화면에서 내리는
  // 결정은 "지금 손이 빈 사람을 어디로 보낼까" 하나뿐이라, 끝난 일은 그
  // 판단을 돕지 않습니다. 누가 얼마나 처리했는지는 호출 알림 탭에 있습니다.
  const waitingByTeam = useMemo(() => {
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
  const rows = useMemo(() => {
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
          waiting: teams.reduce((n, id) => n + (waitingByTeam[id] || 0), 0),
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
  }, [scan.coaches, busyByKey, waitingByTeam])

  const idle = rows.filter((r) => r.busy.length === 0)
  const busy = rows.filter((r) => r.busy.length > 0)

  const myAssignment = crewFor(coach)
  const myTeams = myAssignment?.teamNumbers || []
  const myRange = formatTeamRange(myTeams)
  const totalWaiting = Object.values(waitingByTeam).reduce((n, v) => n + v, 0)
  const myWaiting = myAssignment?.callManager
    ? totalWaiting
    : myTeams.reduce((n, id) => n + (waitingByTeam[id] || 0), 0)

  const pool = filter === 'idle' ? idle : filter === 'busy' ? busy : rows
  const shown = [...pool].sort((a, b) =>
    sort === 'waiting'
      ? b.waiting - a.waiting || a.sortKey - b.sortKey
      : a.sortKey - b.sortKey || a.coach.name.localeCompare(b.coach.name),
  )

  // 세 칸이 곧 요약입니다 — 대기 몇 명, 대응 몇 명, 전부 몇 명.
  // 색으로도 갈립니다(초록=대기, 붉은=대응). 목록의 아바타 테두리와 같은 규칙.
  const TABS = [
    { id: 'idle', label: '대기 중', count: idle.length, tone: 'idle' },
    { id: 'busy', label: '대응 중', count: busy.length, tone: 'busy' },
    { id: 'all', label: '전체', count: rows.length, tone: 'all' },
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
            <span className="stat-label">지금 대기 중인 호출</span>
            <span className="stat-value">
              {totalWaiting}
              <small>건</small>
            </span>
          </span>
          <span className="stat-divide" aria-hidden="true" />
          <span className="stat">
            <span className="stat-label">
              내 담당{myRange ? ` (${myRange})` : myAssignment?.callManager ? ' (전체)' : ''}
            </span>
            <span className="stat-value accent">
              {myWaiting}
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
            className={`filter-chip${sort === 'waiting' ? ' on' : ''}`}
            onClick={() => setSort('waiting')}
            aria-pressed={sort === 'waiting'}
          >
            대기 많은 순
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
        {rows.length === 0 ? (
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
            const isMe = m.ids.includes(coach.id) || m.coach.name.startsWith(coach.name)
            const isBusy = m.busy.length > 0
            return (
              <div key={m.coach.id} className={`mate-row${isBusy ? ' busy' : ' idle'}`}>
                <span className="mate-avatar" aria-hidden="true">{m.initial}</span>
                <span className="mate-body">
                  <span className="mate-line">
                    <b className="mate-name">{m.coach.name}</b>
                    {isMe && <span className="mate-me">나</span>}
                  </span>
                  <span className="mate-range">
                    {m.range ? `팀 ${m.range}` : m.roleLabel || '담당 미배정'}
                  </span>
                </span>
                {/* 여기서 '대기'가 두 뜻으로 쓰이던 자리입니다 — 숫자는 그
                    구간에 밀린 호출, 아래 글자는 그 사람이 비어 있다는 뜻.
                    말이 겹치면 새벽에 잘못 읽습니다. 숫자에만 '대기'를
                    남기고, 사람 상태는 아바타 색과 위치 표시로 말합니다. */}
                <span className="mate-right">
                  <span className={`mate-calls${m.waiting ? ' hot' : ''}`}>
                    {m.waiting}
                    <small>건 대기</small>
                  </span>
                  {isBusy && (
                    <span className="mate-at">
                      <Icon name="pin" size={13} />
                      팀 {m.busy.map((x) => x.teamId).join(', ')}
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
