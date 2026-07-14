import { useMemo } from 'react'
import { COACH_GROUPS, getCoachGroupForTeam } from '../config.js'

// 코치 현황 (PRD 요청 #5): 위치 지도 대신, 조별 코치 리스트를 한눈에.
// 각 코치가 쉬는 중인지 / 어떤 팀 호출을 대응 중인지 표시.
// 목적: 특정 조 코치가 전원 대응 중이면 다른 조 코치가 지원하도록 판단.
export default function CoachStatusTab({ scan, coach }) {
  // 진행 중(in_progress) 호출에서 담당 코치별로 어떤 팀을 맡고 있는지 매핑
  const busyByCoachId = useMemo(() => {
    const map = {}
    Object.entries(scan.calls).forEach(([teamId, data]) => {
      ;(data.calls || []).forEach((c) => {
        if (c.status === 'in_progress' && c.handledById) {
          map[c.handledById] = map[c.handledById] || []
          map[c.handledById].push({ teamId, reason: c.reason })
        }
      })
    })
    return map
  }, [scan.calls])

  // 대기 중인 호출을 조별로 집계 (팀 번호로 담당 조 판별)
  const waitingByGroup = useMemo(() => {
    const map = {}
    Object.entries(scan.calls).forEach(([teamId, data]) => {
      const groupLabel = getCoachGroupForTeam(teamId)?.label || '미배정'
      ;(data.calls || []).forEach((c) => {
        if (c.status === 'waiting') map[groupLabel] = (map[groupLabel] || 0) + 1
      })
    })
    return map
  }, [scan.calls])

  // 조별 코치 그룹 (등록된 조 순서 + 목록에 없는 조도 뒤에)
  const groupLabelsInUse = [
    ...COACH_GROUPS.map((g) => g.label).filter((label) => scan.coaches.some((co) => co.group === label)),
    ...[...new Set(scan.coaches.map((c) => c.group))].filter(
      (label) => !COACH_GROUPS.some((g) => g.label === label),
    ),
  ]

  return (
    <div>
      <section className="panel">
        <h3>코치 현황 ({scan.coaches.length}명)</h3>
        {scan.coaches.length === 0 ? (
          <p className="empty-text">아직 입장한 코치가 없습니다.</p>
        ) : (
          groupLabelsInUse.map((groupLabel) => {
            const list = scan.coaches.filter((c) => c.group === groupLabel)
            const busyCount = list.filter((c) => (busyByCoachId[c.id] || []).length > 0).length
            const allBusy = busyCount === list.length && list.length > 0
            const waiting = waitingByGroup[groupLabel] || 0
            return (
              <div key={groupLabel} className={`coach-company${allBusy ? ' all-busy' : ''}`}>
                <div className="coach-company-head">
                  <b>{groupLabel}</b>
                  <span className="coach-company-meta">
                    {list.length}명 중 {busyCount}명 대응 중
                    {allBusy && ' · 전원 대응 중 ⚠️'}
                    {waiting > 0 && ` · 대기 호출 ${waiting}건`}
                  </span>
                </div>
                <div className="coach-list">
                  {list.map((c) => {
                    const busy = busyByCoachId[c.id] || []
                    const isMe = c.id === coach.id
                    return (
                      <div key={c.id} className={`coach-item${busy.length ? ' busy' : ' idle'}`}>
                        <span className="coach-name">
                          🧑‍🏫 {c.name}
                          {isMe && <span className="coach-me">나</span>}
                        </span>
                        {busy.length ? (
                          <span className="coach-status busy">
                            🔴 팀 {busy.map((b) => b.teamId).join(', ')} 대응 중
                          </span>
                        ) : (
                          <span className="coach-status idle">🟢 대기 중</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </section>

      <p className="coach-note">
        💡 우리 조 코치가 모두 대응 중이면, 다른 조 코치가 지원할 수 있습니다. 위 현황으로 여유 있는
        코치를 확인하세요.
      </p>
    </div>
  )
}
