import { useMemo } from 'react'
import {
  COACH_ASSIGNMENTS,
  MEALS,
  MENU_BY_ID,
  formatTeamRange,
  getAssignedCoachForTeam,
} from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'

// 상단 KPI 카드를 누르면 그 숫자의 '내용'을 보여주는 시트.
// 숫자만 보고 "그래서 어느 팀?"을 다시 찾아 헤매지 않도록, 각 카드마다
// 해당하는 목록을 그대로 펼쳐줍니다. 팀 목록은 모두 번호 순입니다.
const byTeamNo = (a, b) => a.localeCompare(b, undefined, { numeric: true })

export default function KpiDetailSheet({ kind, scan, onClose }) {
  const drag = useSheetDrag(onClose)

  const view = useMemo(() => {
    if (kind === 'waiting') {
      // 대기 중 호출 — 오래 기다린 순
      const rows = Object.entries(scan.calls)
        .flatMap(([teamId, data]) =>
          (data.calls || [])
            .filter((c) => c.status === 'waiting')
            .map((c) => ({ teamId, call: c })),
        )
        .sort((a, b) => (a.call.createdAt || 0) - (b.call.createdAt || 0))
      return {
        title: '대기 중 호출',
        empty: '대기 중인 호출이 없습니다.',
        items: rows.map(({ teamId, call }) => ({
          key: call.id,
          head: `팀 ${teamId}`,
          sub: getAssignedCoachForTeam(teamId)?.name
            ? `담당 ${getAssignedCoachForTeam(teamId).name}`
            : '담당 미배정',
          body: call.reason || '',
        })),
      }
    }

    if (kind === 'orders') {
      // 주문한 팀 — 무엇을 얼마나 담았는지 함께
      const ids = Object.keys(scan.orders)
        .filter((id) =>
          MEALS.some((m) => (scan.orders[id]?.meals?.[m.id]?.items || []).length > 0),
        )
        .sort(byTeamNo)
      return {
        title: '주문한 팀',
        empty: '아직 주문한 팀이 없습니다.',
        items: ids.map((id) => ({
          key: id,
          head: `팀 ${id}`,
          sub: `${scan.teams[id]?.memberCount || '-'}명`,
          body: MEALS.flatMap((m) =>
            (scan.orders[id]?.meals?.[m.id]?.items || []).map(
              ({ menuId, qty }) => `${MENU_BY_ID[menuId]?.name.replace('\n', ' ') || menuId} ${qty}`,
            ),
          ).join(' · '),
        })),
      }
    }

    if (kind === 'teams') {
      const ids = Object.keys(scan.teams).sort(byTeamNo)
      return {
        title: '등록한 팀',
        empty: '아직 등록한 팀이 없습니다.',
        items: ids.map((id) => {
          const t = scan.teams[id] || {}
          const people = (t.allergies || []).length
          return {
            key: id,
            head: `팀 ${id}`,
            sub: `${t.memberCount || '-'}명`,
            body: people ? `알러지 ${people}명` : '',
          }
        }),
      }
    }

    // 입장한 마스터 메이트 — 담당 팀 번호 순, 지금 대응 중인지 함께
    const busyTeamsById = {}
    Object.entries(scan.calls).forEach(([teamId, data]) => {
      ;(data.calls || []).forEach((c) => {
        if (c.status === 'in_progress' && c.handledById) {
          busyTeamsById[c.handledById] = busyTeamsById[c.handledById] || []
          busyTeamsById[c.handledById].push(teamId)
        }
      })
    })
    const items = scan.coaches
      .map((c) => {
        const teams = COACH_ASSIGNMENTS.find((a) => a.name === c.name)?.teamNumbers || []
        const busy = busyTeamsById[c.id] || []
        return {
          key: c.id,
          head: c.name,
          sub: teams.length ? `팀 ${formatTeamRange(teams)}` : '담당 미배정',
          body: busy.length ? `🔴 팀 ${busy.join(', ')} 대응 중` : '🟢 대기 중',
          sortKey: teams.length ? Math.min(...teams) : Number.MAX_SAFE_INTEGER,
        }
      })
      .sort((a, b) => a.sortKey - b.sortKey || a.head.localeCompare(b.head))
    return {
      title: '입장한 마스터 메이트',
      empty: '아직 입장한 마스터 메이트가 없습니다.',
      items,
    }
  }, [kind, scan])

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-sheet-title"
        onClick={(event) => event.stopPropagation()}
        style={drag.sheetStyle}
      >
        <div className="sheet-handle" aria-hidden="true" {...drag.handleHandlers} />
        <div className="sheet-head">
          <h3 id="kpi-sheet-title">{view.title}</h3>
          <button className="sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="sheet-body">
          {(view.items || []).length === 0 ? (
            <p className="empty-text">{view.empty}</p>
          ) : (
            <div className="kpi-detail-list">
              {view.items.map((it) => (
                <div key={it.key} className="kpi-detail-row">
                  <div className="kpi-detail-head">
                    <b>{it.head}</b>
                    {it.sub && <span className="kpi-detail-sub">{it.sub}</span>}
                  </div>
                  {it.body && <div className="kpi-detail-body">{it.body}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
