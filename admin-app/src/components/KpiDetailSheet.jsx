import { useEffect, useMemo, useState } from 'react'
import {
  COACH_ASSIGNMENTS,
  MEALS,
  MEAL_BY_ID,
  ALL_TEAM_IDS,
  LEAGUES,
  groupByLeague,
  formatTeamRange,
  getAssignedCoachForTeam,
} from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { notifyMissing, nudgeParticipants } from '../lib/storage.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

// 상단 KPI 카드를 누르면 그 숫자의 '내용'을 보여주는 시트.
//
// 등록·주문·입장은 "누가 했는가"보다 **누가 아직 안 했는가**를 찾는 것이 목적입니다
// (미등록 팀 독려, 미주문 팀 독려, 미입장 메이트 확인). 그래서 한 항목씩 나열하지
// 않고 전체 대상(모든 테이블 번호 / 명단 전원)을 미리 깔아두고 완료 여부를
// 표시하는 격자로 보여줍니다. 빠진 칸이 곧 할 일이 됩니다.
//
// 대기 중 호출은 성격이 달라(대상이 정해져 있지 않은 사건 목록) 그대로 목록입니다.


export default function KpiDetailSheet({ kind, scan, coach, mealFilter, onToast, onClose }) {
  // KPI 카드가 전체 숫자를 보여주므로, 눌러서 열리는 격자도 전체를 보여줍니다.
  // 예전에는 메이트에게 자동으로 담당 팀만 걸러 보여줬는데, 카드와 상세가
  // 다른 말을 해서 무엇이 나올지 예측할 수 없었습니다. 좁혀 보는 것은
  // '내 담당만' 스위치로 드러냅니다 (담당 팀이 있는 사람에게만 보임).
  const myAssignment = COACH_ASSIGNMENTS.find((c) => c.name && c.name === coach?.name) || null
  const myTeams = myAssignment?.teamNumbers || []
  const rosterConfigured = COACH_ASSIGNMENTS.some((c) => c.name)
  const isManager = !!myAssignment?.callManager
  const [onlyMine, setOnlyMine] = useState(false)
  const canFilterMine = myTeams.length > 0
  // 채널 전체에 재촉을 보내는 건 총관리자만. 명단 설정 전에는 누구도 총관리자가
  // 아니므로, 그때만 예외로 허용합니다(설정 전 테스트용).
  const canNudge = isManager || !rosterConfigured
  const drag = useSheetDrag(onClose)
  const dialogRef = useDialogFocus(true, onClose)
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
    const registered = new Set(Object.keys(scan.teams))
    const ordered = new Set(
      Object.entries(scan.orders)
        .filter(([, o]) => MEALS.some((m) => (o?.meals?.[m.id]?.items || []).length > 0))
        .map(([id]) => id),
    )
    const isOrders = kind === 'orders'
    const mine = new Set(myTeams)
    const targetTeams = ALL_TEAM_IDS.filter((id) => !onlyMine || mine.has(id))
    // 팀 번호가 'E-45'라 격자는 리그별로 나눠 그립니다 (숫자만 칸에 표시)
    const cells = targetTeams.map((id) => ({
      key: id,
      label: id.slice(2),
      league: id.charAt(0),
      done: isOrders ? ordered.has(id) : registered.has(id),
    }))
    const missing = cells.filter((c) => !c.done).map((c) => c.key)
    return {
      mode: 'team-grid',
      title: isOrders ? '팀별 주문 현황' : '팀별 등록 현황',
      cells,
      doneLabel: isOrders ? '주문 완료' : '등록',
      pendingLabel: isOrders ? '미주문' : '미등록',
      missing,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, scan, onlyMine, myTeams.join(',')])

  // 재촉 두 가지. 결과는 토스트로 알리고, 도배 방지 쿨다운은 안내 문구 대신
  // 버튼을 잠가서 표현합니다 (남은 시간이 버튼에 보이므로 문구가 필요 없음).
  const [busy, setBusy] = useState(null) // 'popup' | 'slack'
  const [until, setUntil] = useState({}) // { popup: ms, slack: ms }
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!until.popup && !until.slack) return undefined
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [until.popup, until.slack])
  const leftSec = (key) => Math.max(0, Math.ceil(((until[key] || 0) - Date.now()) / 1000))
  const lock = (key, sec) => setUntil((u) => ({ ...u, [key]: Date.now() + sec * 1000 }))
  const COOLDOWN_SEC = 120

  const sendPopup = async () => {
    setBusy('popup')
    try {
      await nudgeParticipants(mealFilter)
      lock('popup', COOLDOWN_SEC)
      onToast?.('참가자 주문 페이지에 알림을 보냈습니다.')
    } catch (err) {
      if (err?.code === 'cooldown') {
        lock('popup', err.data?.retryAfterSec || COOLDOWN_SEC)
        onToast?.('방금 보냈습니다. 잠시 후 다시 시도해주세요.')
      } else if (err?.code === 'endpoint-missing') {
        onToast?.('공유 서버 배포가 아직 반영되지 않았습니다.')
      } else {
        onToast?.('알림을 보내지 못했습니다.')
      }
    }
    setBusy(null)
  }

  const sendNudge = async () => {
    setBusy('slack')
    try {
      const r = await notifyMissing({
        kind: kind === 'orders' ? 'orders' : 'teams',
        leagues: LEAGUES.map((l) => ({ prefix: l.prefix, count: l.count })),
        mealId: mealFilter,
        label: MEAL_BY_ID[mealFilter]?.label || '',
      })
      if (r?.sent) {
        lock('slack', COOLDOWN_SEC)
        onToast?.('슬랙에 알림을 보냈습니다.')
      } else if (r?.teams === 0) {
        onToast?.('모두 완료된 상태입니다.')
      } else {
        onToast?.('알림을 보내지 못했습니다.')
      }
    } catch (err) {
      if (err?.code === 'cooldown') {
        lock('slack', err.data?.retryAfterSec || COOLDOWN_SEC)
        onToast?.('방금 보냈습니다. 잠시 후 다시 시도해주세요.')
      } else if (err?.code === 'slack disabled') {
        onToast?.('슬랙 웹훅이 설정되지 않았습니다.')
      } else if (err?.code === 'endpoint-missing') {
        onToast?.('공유 서버 배포가 아직 반영되지 않았습니다.')
      } else {
        onToast?.('알림을 보내지 못했습니다.')
      }
    }
    setBusy(null)
  }

  const done = (data.cells || []).filter((c) => c.done).length
  const total = (data.cells || []).length
  const cells = onlyPending ? data.cells.filter((c) => !c.done) : data.cells

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-sheet-title"
        tabIndex={-1}
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
              <div className="grid-toggles">
                <label className="grid-toggle">
                  <input
                    type="checkbox"
                    checked={onlyPending}
                    onChange={(e) => setOnlyPending(e.target.checked)}
                  />
                  {data.pendingLabel}만
                </label>
                {/* 담당 팀이 배정된 사람에게만 — 총관리자는 담당 구간이 없습니다 */}
                {canFilterMine && data.mode === 'team-grid' && (
                  <label className="grid-toggle">
                    <input
                      type="checkbox"
                      checked={onlyMine}
                      onChange={(e) => setOnlyMine(e.target.checked)}
                    />
                    내 담당만
                  </label>
                )}
              </div>
              {/* 요약·스위치와 같은 줄에 둡니다. 줄을 따로 만들면 넓은 화면에서
                  빈 공간만 늘어납니다 */}
              {data.mode === 'team-grid' && data.missing.length > 0 && canNudge && (
                <div className="nudge-actions">
                  {/* 주문 재촉만 참가자에게 띄웁니다. 등록은 아직 앱에 들어온
                      적이 없는 팀이라 띄울 화면 자체가 없습니다.
                      이모지를 붙이면 버튼 글자가 줄바꿈돼 빼두었습니다 */}
                  {kind === 'orders' && (
                    <button
                      className="btn-primary sm"
                      onClick={sendPopup}
                      disabled={busy === 'popup' || leftSec('popup') > 0}
                    >
                      {busy === 'popup'
                        ? '띄우는 중…'
                        : leftSec('popup') > 0
                          ? leftSec('popup') + '초 후 가능'
                          : '주문 페이지에 띄우기'}
                    </button>
                  )}
                  <button
                    className="btn-outline sm"
                    onClick={sendNudge}
                    disabled={busy === 'slack' || leftSec('slack') > 0}
                  >
                    {busy === 'slack'
                      ? '보내는 중…'
                      : leftSec('slack') > 0
                        ? leftSec('slack') + '초 후 가능'
                        : '슬랙으로 알리기'}
                  </button>
                </div>
              )}
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
            LEAGUES.map((league) => {
              const 칸 = cells.filter((c) => c.league === league.prefix)
              if (!칸.length) return null
              return (
                <div key={league.id} className="league-block">
                  <div className="league-block-head">
                    {league.label} <span>{league.prefix}-</span>
                  </div>
                  <div className="check-grid">
                    {칸.map((c) => (
                      <span key={c.key} className={`check-cell${c.done ? ' done' : ''}`}>
                        {c.label}
                        {c.done && <b aria-hidden="true">✓</b>}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })
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
