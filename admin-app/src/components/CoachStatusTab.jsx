import { useMemo } from 'react'
import { COACH_ASSIGNMENTS, formatTeamRange } from '../config.js'

// 캠프지기 현황 (PRD 요청 #5): 위치 지도 대신, 캠프지기 개인별 리스트를 한눈에.
// 각 캠프지기가 쉬는 중인지 / 어떤 팀 호출을 대응 중인지 표시.
// 목적: 특정 캠프지기가 바쁘면(대응 중이면) 다른 캠프지기가 그 담당 팀 호출을 대신 볼 수 있게.
export default function CoachStatusTab({ scan, coach }) {
  // 진행 중(in_progress) 호출에서 담당 캠프지기별로 어떤 팀을 맡고 있는지 매핑
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

  // 이 기기 캠프지기의 이름이 COACH_ASSIGNMENTS 명단과 일치하면, 그 캠프지기가
  // 담당하는 팀 중 대기중인 호출 수를 세어 보여줌 (본인 백로그 확인용)
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

  return (
    <div>
      <section className="panel">
        <h3>캠프지기 현황 ({scan.coaches.length}명)</h3>
        {scan.coaches.length === 0 ? (
          <p className="empty-text">아직 입장한 캠프지기가 없습니다.</p>
        ) : (
          <div className="coach-list">
            {scan.coaches.map((c) => {
              const busy = busyByCoachId[c.id] || []
              const isMe = c.id === coach.id
              const waiting = waitingCountByName[c.name] || 0
              const assigned = COACH_ASSIGNMENTS.find((a) => a.name === c.name)
              const range = formatTeamRange(assigned?.teamNumbers)
              return (
                <div key={c.id} className={`coach-item${busy.length ? ' busy' : ' idle'}`}>
                  <span className="coach-name">
                    🧑‍🏫 {c.name}
                    <span className="coach-range">{range ? `팀 ${range}` : '담당 미배정'}</span>
                    {isMe && <span className="coach-me">나</span>}
                    {waiting > 0 && <span className="avg-wait">담당 대기 {waiting}건</span>}
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
        )}
      </section>

      <p className="coach-note">
        💡 담당 캠프지기가 바쁘면(🔴), 그 캠프지기 담당 팀의 대기 호출을 다른 캠프지기가 대신 처리할 수 있습니다.
      </p>
    </div>
  )
}
