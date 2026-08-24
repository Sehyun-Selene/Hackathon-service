import { useMemo, useState } from 'react'
import {
  COACH_ASSIGNMENTS,
  MEALS,
  TOTAL_TEAMS,
  formatTeamRange,
  getAssignedCoachForTeam,
} from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'

// 상단 KPI 카드를 누르면 그 숫자의 '내용'을 보여주는 시트.
//
// 등록·주문·입장은 "누가 했는가"보다 **누가 아직 안 했는가**를 찾는 것이 목적입니다
// (미등록 팀 독려, 미주문 팀 독려, 미입장 메이트 확인). 그래서 한 항목씩 나열하지
// 않고 전체 대상(팀 1~TOTAL_TEAMS / 명단 전원)을 미리 깔아두고 완료 여부를
// 표시하는 격자로 보여줍니다. 빠진 칸이 곧 할 일이 됩니다.
//
// 대기 중 호출은 성격이 달라(대상이 정해져 있지 않은 사건 목록) 그대로 목록입니다.

const teamNo = (id) => parseInt(id, 10)

export default function KpiDetailSheet({ kind, scan, onClose }) {
  const drag = useSheetDrag(onClose)
  const [onlyPending, setOnlyPending] = useState(false)

  const data = useMemo(() => {
    if (kind === 'waiting') {
      const rows = Object.entries(scan.calls)
        .flatMap(([teamId, d]) =>
          (d.calls || []).filter((c) => c.status === 'waiting').map((c) => ({ teamId, call: c })),
        )
        .sort((a, b) => (a.call.createdAt || 0) - (b.call.createdAt || 0))
      return { mode: 'list', title: '대기 중 호출', rows }
    }

    if (kind === 'coaches') {
      // 명단 전원을 깔고 입장 여부를 표시 (미입장 파악이 목적)
      const enteredNames = new Set(scan.coaches.map((c) => c.name))
      const roster = COACH_ASSIGNMENTS.filter((c) => c.name)
      // 명단이 아직 비어 있으면 입장한 사람만이라도 보여줍니다
      const cells = roster.length
        ? roster
            .map((c) => ({
              key: c.id,
              label: c.name,
              note: c.teamNumbers.length ? `팀 ${formatTeamRange(c.teamNumbers)}` : '담당 미배정',
              done: enteredNames.has(c.name),
              sortKey: c.teamNumbers.length ? Math.min(...c.teamNumbers) : Number.MAX_SAFE_INTEGER,
            }))
            .sort((a, b) => a.sortKey - b.sortKey || a.label.localeCompare(b.label))
        : [...new Set(scan.coaches.map((c) => c.name))].map((name) => ({
            key: name,
            label: name,
            note: '명단 외',
            done: true,
          }))
      return {
        mode: 'name-grid',
        title: '마스터 메이트 입장 현황',
        cells,
        doneLabel: '입장',
        pendingLabel: '미입장',
        rosterMissing: roster.length === 0,
      }
    }

    // 팀 격자 — 등록 / 주문
    const registered = new Set(Object.keys(scan.teams).map(teamNo))
    const ordered = new Set(
      Object.entries(scan.orders)
        .filter(([, o]) => MEALS.some((m) => (o?.meals?.[m.id]?.items || []).length > 0))
        .map(([id]) => teamNo(id)),
    )
    const isOrders = kind === 'orders'
    const cells = Array.from({ length: TOTAL_TEAMS }, (_, i) => {
      const n = i + 1
      return { key: n, label: n, done: isOrders ? ordered.has(n) : registered.has(n) }
    })
    return {
      mode: 'team-grid',
      title: isOrders ? '팀별 주문 현황' : '팀별 등록 현황',
      cells,
      doneLabel: isOrders ? '주문 완료' : '등록',
      pendingLabel: isOrders ? '미주문' : '미등록',
    }
  }, [kind, scan])

  const done = (data.cells || []).filter((c) => c.done).length
  const total = (data.cells || []).length
  const cells = onlyPending ? data.cells.filter((c) => !c.done) : data.cells

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
          <h3 id="kpi-sheet-title">{data.title}</h3>
          <button className="sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>

        {data.mode !== 'list' && (
          <>
            <div className="grid-summary">
              <span>
                {data.doneLabel} <b>{done}</b> / {total}
              </span>
              <label className="grid-toggle">
                <input
                  type="checkbox"
                  checked={onlyPending}
                  onChange={(e) => setOnlyPending(e.target.checked)}
                />
                {data.pendingLabel}만 보기
              </label>
            </div>
            {data.rosterMissing && (
              <p className="sheet-description">
                config의 마스터 메이트 명단이 비어 있어, 입장한 인원만 표시합니다.
              </p>
            )}
          </>
        )}

        <div className="sheet-body">
          {data.mode === 'list' ? (
            data.rows.length === 0 ? (
              <p className="empty-text">대기 중인 호출이 없습니다.</p>
            ) : (
              <div className="kpi-detail-list">
                {data.rows.map(({ teamId, call }) => (
                  <div key={call.id} className="kpi-detail-row">
                    <div className="kpi-detail-head">
                      <b>팀 {teamId}</b>
                      <span className="kpi-detail-sub">
                        {getAssignedCoachForTeam(teamId)?.name
                          ? `담당 ${getAssignedCoachForTeam(teamId).name}`
                          : '담당 미배정'}
                      </span>
                    </div>
                    {call.reason && <div className="kpi-detail-body">{call.reason}</div>}
                  </div>
                ))}
              </div>
            )
          ) : cells.length === 0 ? (
            <p className="empty-text">모두 완료됐습니다. 🎉</p>
          ) : data.mode === 'team-grid' ? (
            <div className="check-grid">
              {cells.map((c) => (
                <span key={c.key} className={`check-cell${c.done ? ' done' : ''}`}>
                  {c.label}
                  {c.done && <b aria-hidden="true">✓</b>}
                </span>
              ))}
            </div>
          ) : (
            <div className="check-names">
              {cells.map((c) => (
                <div key={c.key} className={`check-name${c.done ? ' done' : ''}`}>
                  <span className="check-name-mark" aria-hidden="true">
                    {c.done ? '✓' : '·'}
                  </span>
                  <b>{c.label}</b>
                  <span className="check-name-note">{c.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </section>
    </div>
  )
}
