import { useMemo, useState } from 'react'
import { COACH_ASSIGNMENTS, formatTeamRange } from '../config.js'

// 마스터 메이트 현황 (PRD 요청 #5): 위치 지도 대신, 마스터 메이트 개인별 리스트를 한눈에.
// 목적: 특정 마스터 메이트가 바쁘면(대응 중이면) 다른 마스터 메이트가 그 담당 팀
// 호출을 대신 볼 수 있게.
//
// 40명 규모에서는 한 목록에 전부 쌓으면 "지금 누가 비었나"를 찾기 어려우므로
// 대기 중 / 대응 중으로 나눠 보고, 정렬은 담당 팀 번호 순으로 고정합니다
// (이름 순이면 "팀 47 담당이 누구지"를 눈으로 훑어야 함).
export default function CoachStatusTab({ scan, coach }) {
  const [filter, setFilter] = useState('idle') // idle | busy | all

  // 진행 중(in_progress) 호출에서 담당 마스터 메이트별로 어떤 팀을 맡고 있는지 매핑
  const busyByCoachId = useMemo(() => {
    const map = {}
    Object.entries(scan.calls).forEach(([teamId, data]) => {
      ;(data.calls || []).forEach((c) => {
        if (c.status === 'in_progress' && c.handledById) {
          map[c.handledById] = map[c.handledById] || []
          map[c.handledById].push({ teamId })
        }
      })
    })
    return map
  }, [scan.calls])

  // 이름이 COACH_ASSIGNMENTS 명단과 일치하면, 그가 담당하는 팀 중 대기중인
  // 호출 수를 세어 보여줌 (본인 백로그 확인용)
  const waitingCountByName = useMemo(() => {
    const map = {}
    Object.entries(scan.calls).forEach(([teamId, data]) => {
      const assigned = COACH_ASSIGNMENTS.find((c) => c.teamNumbers.includes(parseInt(teamId, 10)))
      if (!assigned?.name) return
      ;(data.calls || []).forEach((c) => {
        if (c.status === 'waiting') map[assigned.name] = (map[assigned.name] || 0) + 1
      })
    })
    return map
  }, [scan.calls])

  // 담당 팀 번호(가장 작은 번호) 기준 정렬. 미배정은 뒤로.
  const rows = useMemo(() => {
    return scan.coaches
      .map((c) => {
        const assigned = COACH_ASSIGNMENTS.find((a) => a.name === c.name)
        const teams = assigned?.teamNumbers || []
        return {
          coach: c,
          busy: busyByCoachId[c.id] || [],
          waiting: waitingCountByName[c.name] || 0,
          range: formatTeamRange(teams),
          sortKey: teams.length ? Math.min(...teams) : Number.MAX_SAFE_INTEGER,
        }
      })
      .sort((a, b) => a.sortKey - b.sortKey || a.coach.name.localeCompare(b.coach.name))
  }, [scan.coaches, busyByCoachId, waitingCountByName])

  const idle = rows.filter((r) => r.busy.length === 0)
  const busy = rows.filter((r) => r.busy.length > 0)
  const shown = filter === 'idle' ? idle : filter === 'busy' ? busy : rows

  const TABS = [
    { id: 'idle', label: '대기 중', count: idle.length },
    { id: 'busy', label: '대응 중', count: busy.length },
    { id: 'all', label: '전체', count: rows.length },
  ]

  return (
    <div>
      <section className="panel">
        <div className="panel-head-row">
          <h3>마스터 메이트 현황</h3>
          <span className="coach-summary">
            대기 <b>{idle.length}</b> · 대응 중 <b>{busy.length}</b>
          </span>
        </div>

        <div className="filter-group coach-filters">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`chip${filter === t.id ? ' on' : ''}`}
              onClick={() => setFilter(t.id)}
            >
              {t.label} {t.count}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="empty-text">아직 입장한 마스터 메이트가 없습니다.</p>
        ) : shown.length === 0 ? (
          <p className="empty-text">
            {filter === 'idle'
              ? '지금 대기 중인 마스터 메이트가 없습니다.'
              : '지금 대응 중인 마스터 메이트가 없습니다.'}
          </p>
        ) : (
          <div className="coach-list">
            {shown.map(({ coach: c, busy: b, waiting, range }) => {
              const isMe = c.id === coach.id
              return (
                <div key={c.id} className={`coach-item${b.length ? ' busy' : ' idle'}`}>
                  <span className="coach-name">
                    🧑‍🏫 {c.name}
                    <span className="coach-range">{range ? `팀 ${range}` : '담당 미배정'}</span>
                    {isMe && <span className="coach-me">나</span>}
                    {waiting > 0 && <span className="avg-wait">담당 대기 {waiting}건</span>}
                  </span>
                  {b.length ? (
                    <span className="coach-status busy">
                      🔴 팀 {b.map((x) => x.teamId).join(', ')} 대응 중
                    </span>
                  ) : (
                    <span className="coach-status idle">🟢 대기 중</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <p className="coach-note">
        💡 담당 마스터 메이트가 대응 중(🔴)이면, 그 담당 팀의 대기 호출을 대기 중(🟢)인
        다른 마스터 메이트가 대신 처리할 수 있습니다. 목록은 담당 팀 번호 순입니다.
      </p>
    </div>
  )
}
