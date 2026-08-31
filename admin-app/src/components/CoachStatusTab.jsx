import { useMemo, useState } from 'react'
import { COACH_ASSIGNMENTS, formatTeamRange, teamSortKey } from '../config.js'

// 마스터 메이트 현황 (PRD 요청 #5): 위치 지도 대신, 마스터 메이트 개인별 리스트를 한눈에.
// 목적: 특정 마스터 메이트가 바쁘면(대응 중이면) 다른 마스터 메이트가 그 담당 팀
// 호출을 대신 볼 수 있게.
//
// 40명 규모에서는 한 목록에 전부 쌓으면 "지금 누가 비었나"를 찾기 어려우므로
// 대기 중 / 대응 중으로 나눠 보고, 정렬은 담당 팀 번호 순으로 고정합니다
// (이름 순이면 "팀 47 담당이 누구지"를 눈으로 훑어야 함).
export default function CoachStatusTab({ scan, coach }) {
  const [filter, setFilter] = useState('idle') // idle | busy | all

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

  // 담당 팀 번호(가장 작은 번호) 기준 정렬. 미배정은 뒤로.
  //
  // 입장 기록은 기기 단위입니다. 한 사람이 폰과 노트북에서 열면 두 줄이 되어
  // 인원이 부풀고, 한쪽만 대응 중으로 잡히면 같은 사람이 대기·대응에 동시에
  // 뜹니다. 그래서 이름으로 묶고, 그 사람의 어느 기기든 대응 중이면 대응 중으로
  // 봅니다.
  const rows = useMemo(() => {
    const byName = new Map()
    scan.coaches.forEach((c) => {
      const entry = byName.get(c.name) || { name: c.name, ids: [] }
      entry.ids.push(c.id)
      byName.set(c.name, entry)
    })
    return [...byName.values()]
      .map((person) => {
        const assigned = COACH_ASSIGNMENTS.find((a) => a.name === person.name)
        const teams = assigned?.teamNumbers || []
        return {
          coach: { id: person.ids[0], name: person.name },
          ids: person.ids,
          busy: [
            ...(busyByKey['name:' + person.name] || []),
            ...person.ids.flatMap((id) => busyByKey['id:' + id] || []),
          ],
          range: formatTeamRange(teams),
          // 총관리자는 담당 구간이 없는 게 정상입니다 — 미배정과 구분해 표시
          isManager: !!assigned?.callManager,
          sortKey: teams.length ? Math.min(...teams.map(teamSortKey)) : Number.MAX_SAFE_INTEGER,
        }
      })
      .sort((a, b) => a.sortKey - b.sortKey || a.coach.name.localeCompare(b.coach.name))
  }, [scan.coaches, busyByKey])

  const idle = rows.filter((r) => r.busy.length === 0)
  const busy = rows.filter((r) => r.busy.length > 0)

  // '전체'에서도 섞이지 않게 그룹으로 나눠 보여줍니다. 대기 중을 먼저 —
  // 이 화면을 보는 목적이 "지금 부를 수 있는 사람"을 찾는 것이기 때문입니다.
  const groups =
    filter === 'idle'
      ? [{ id: 'idle', title: '🟢 대기 중', rows: idle }]
      : filter === 'busy'
        ? [{ id: 'busy', title: '🔴 대응 중', rows: busy }]
        : [
            { id: 'idle', title: '🟢 대기 중', rows: idle },
            { id: 'busy', title: '🔴 대응 중', rows: busy },
          ]
  const shownCount = groups.reduce((s, g) => s + g.rows.length, 0)

  // '대기 중'과 '대응 중'은 글자가 비슷하므로 탭 박스 자체를 상태색으로
  // 채웁니다 (초록=대기, 빨강=대응). 목록의 🟢/🔴 표시와 같은 색 규칙.
  const TABS = [
    { id: 'idle', label: '대기 중', count: idle.length, tone: 'idle' },
    { id: 'busy', label: '대응 중', count: busy.length, tone: 'busy' },
    { id: 'all', label: '전체', count: rows.length, tone: null },
  ]

  return (
    <div>
      <section className="panel">
        {/* 화면 제목은 상단바에 있고, 인원수는 탭 라벨에 이미 들어 있어
            별도 요약을 두지 않습니다 (같은 숫자가 두 번 보임). */}
        <div className="coach-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`coach-tab${t.tone ? ` tone-${t.tone}` : ''}${
                filter === t.id ? ' on' : ''
              }`}
              onClick={() => setFilter(t.id)}
            >
              {t.label} <b className="tab-count">{t.count}</b>
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="empty-text">아직 입장한 마스터 메이트가 없습니다.</p>
        ) : shownCount === 0 ? (
          <p className="empty-text">
            {filter === 'idle'
              ? '지금 대기 중인 마스터 메이트가 없습니다.'
              : '지금 대응 중인 마스터 메이트가 없습니다.'}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="coach-group">
              {/* 그룹 제목은 두 그룹이 함께 보이는 '전체'에서만 — 필터를 걸면
                  칩과 같은 말이 반복되므로 생략 */}
              {filter === 'all' && (
                <div className="coach-group-head">
                  {g.title} <b>{g.rows.length}명</b>
                </div>
              )}
              {g.rows.length === 0 ? (
                <p className="empty-text coach-group-empty">
                  {g.id === 'idle' ? '모두 대응 중입니다.' : '대응 중인 인원이 없습니다.'}
                </p>
              ) : (
                <div className="coach-list">
                  {g.rows.map(({ coach: c, busy: b, range, ids, isManager }) => {
                    // 내 기기가 그 사람의 기기 목록에 있으면 '나'
                    const isMe = ids.includes(coach.id) || c.name === coach.name
                    return (
                      <div key={c.id} className={`coach-item${b.length ? ' busy' : ' idle'}`}>
                        <span className="coach-name">
                          🧑‍🏫 {c.name}
                          <span className="coach-range">
                            {range ? `팀 ${range}` : isManager ? '총관리자' : '담당 미배정'}
                          </span>
                          {isMe && <span className="coach-me">나</span>}
                        </span>
                        {/* 대기 중은 탭·그룹 제목이 이미 말해주므로 문구를 두지
                            않습니다. 대응 중은 '어느 팀'이라는 정보가 있어 표시 */}
                        {b.length > 0 && (
                          <span className="coach-status busy">
                            🔴 팀 {b.map((x) => x.teamId).join(', ')}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </section>

      <p className="coach-note">
        💡 대기 중(🟢)인 마스터 메이트는, 대응 중(🔴)인 담당자의 팀에 쌓인 대기 호출을
        대신 처리할 수 있습니다.
      </p>
    </div>
  )
}
