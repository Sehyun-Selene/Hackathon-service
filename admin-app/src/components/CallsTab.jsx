import { useEffect, useState } from 'react'
import {
  CALL_LIMIT_PER_TEAM,
  ALL_TEAM_IDS,
  groupByLeague,
  getAssignedCoachForTeam,
  isCoachForTeam,
  crewFor,
  assignedCoachLabel,
  teamLabel,
  leagueAllowsCall,
} from '../config.js'
import { fmtTimeOnly } from '../lib/time.js'
import { isHandledByMe } from '../lib/storage.js'
import Icon from './Icon.jsx'
import AdminDock, { DockHint } from './AdminDock.jsx'

// 오래 기다린 호출을 붉게 칠하는 기준. 3분이 넘어가면 참가자는 "안 오나?"
// 하고 다시 부를지 고민하기 시작합니다.
const URGENT_MS = 3 * 60 * 1000

// 'E-45' → 'E-45' / 'E-105' → 'E-105'. 아바타 칸에 들어갈 짧은 표기입니다.
const shortTeam = (teamId) => String(teamId || '').replace(/^([EG])-0*/, '$1-')

// 경과 시간을 짧게. 목록에서 한 줄에 들어가야 해서 '분/시간'까지만 씁니다.
function agoText(ms) {
  const min = Math.floor(ms / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분`
  return `${Math.floor(min / 60)}시간 ${min % 60}분`
}

// 마스터 메이트 호출 알림.
//
// 화면 구조는 하나의 규칙으로 정리돼 있습니다 — 목록은 고르기만 하고,
// 동작은 아래 고정 바(AdminDock)에서만 일어납니다. 걸어 다니며 한 손으로
// 쓰는 화면이라, 목록을 스치는 것만으로 상태가 바뀌면 안 됩니다.
export default function CallsTab({
  scan,
  coach,
  onUpdateStatus,
  onOpenMenu,
  menuAlert,
  menuOpen,
  syncAt,
  onRefresh,
  refreshing,
}) {
  // 'all' | 'mine' | 'unassigned' — 예전에는 체크박스 두 개였는데, 서로
  // 겹칠 수 있어 "내 담당이면서 미배정"이라는 빈 목록이 나왔습니다.
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  // "내 담당"은 이름이 아니라 배정으로 가립니다. 이름이 겹치는 분들이
  // 있고(이상윤 두 분), 리테일 조처럼 한 구간을 여럿이 함께 맡으면
  // 이름 비교로는 첫 번째 사람만 담당이 됩니다.
  const myAssignment = crewFor(coach)

  const all = Object.entries(scan.calls).flatMap(([teamId, data]) =>
    (data.calls || []).map((c) => ({
      ...c,
      team: teamId,
      assignedName: getAssignedCoachForTeam(teamId)?.name || '',
      assignedLabel: assignedCoachLabel(teamId) || '미배정',
      mine: isCoachForTeam(myAssignment, teamId),
    })),
  )

  // 처리중인 호출이 맨 위. 지금 누군가 가 있는 건이라 상태가 가장 자주
  // 바뀌고, 완료를 누를 사람도 이 화면을 보고 있습니다.
  const active = all
    .filter((c) => c.status !== 'done')
    .sort((a, b) => {
      const rank = (c) => (c.status === 'in_progress' ? 0 : c.mine ? 1 : 2)
      return rank(a) - rank(b) || a.createdAt - b.createdAt
    })

  // 완료 이력은 내가 처리한 것만. 전원 이력이 섞이면 40명 규모에서 목록이
  // 길어지고, 정작 "내가 뭘 처리했는지" 확인이 어려워짐.
  const done = all
    .filter((c) => c.status === 'done' && isHandledByMe(c, coach))
    .sort((a, b) => b.doneAt - a.doneAt)

  const mineCount = active.filter((c) => c.mine).length
  const unassignedCount = active.filter((c) => !c.assignedName).length
  const waitingCount = active.filter((c) => c.status === 'waiting').length

  const shown = active.filter((c) => {
    if (filter === 'mine') return c.mine
    if (filter === 'unassigned') return !c.assignedName
    return true
  })

  // 내가 잡은 호출은 자동으로 골라 둡니다 — 완료를 누르러 돌아왔을 때
  // 목록에서 다시 찾게 하지 않습니다.
  const myInProgress = active.find((c) => c.status === 'in_progress' && isHandledByMe(c, coach))
  const selected =
    shown.find((c) => c.id === selectedId) || myInProgress || null

  // 고른 호출이 목록에서 사라지면(다른 메이트가 완료 처리) 선택을 놓습니다.
  useEffect(() => {
    if (selectedId && !active.some((c) => c.id === selectedId)) setSelectedId(null)
  }, [selectedId, active])

  const nowMs = Date.now()
  const canControl = (c) => isHandledByMe(c, coach) || !!myAssignment?.callManager
  const showAllTeams = !!myAssignment?.callManager
  const myTeams = myAssignment?.teamNumbers || []
  // 호출 횟수는 내 담당 팀만 봅니다. 남의 담당 팀 잔여 횟수는 내가 판단할
  // 일이 아니고, 전체를 보는 건 총관리자뿐입니다.
  const countGroups = groupByLeague(
    (showAllTeams ? ALL_TEAM_IDS : myTeams).filter(leagueAllowsCall),
  )
  // 식음 운영처럼 담당 구간이 아예 없는 역할에는 이 패널이 늘 비어 있습니다.
  const showCounts = showAllTeams || myTeams.length > 0

  const FILTERS = [
    { id: 'all', label: '전체', count: active.length },
    { id: 'mine', label: '내 담당', count: mineCount, hide: myTeams.length === 0 },
    { id: 'unassigned', label: '미배정', count: unassignedCount, hide: !showAllTeams },
  ].filter((f) => !f.hide)

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="screen-head-text">
          <h1 className="screen-title">호출 알림</h1>
          <p className="screen-sync">
            <span className="live-dot" aria-hidden="true" />
            실시간 동기화{syncAt ? ` · ${fmtTimeOnly(syncAt)}` : ''}
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

      <div className="chip-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`filter-chip${filter === f.id ? ' on' : ''}`}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
          >
            {f.label} {f.count}
          </button>
        ))}
        <span className="chip-spacer" />
        {waitingCount > 0 && <span className="waiting-chip">대기 {waitingCount}</span>}
      </div>

      <div className="call-list">
        {shown.length === 0 ? (
          <p className="empty-text">
            {filter === 'unassigned'
              ? '담당자가 없는 호출이 없습니다.'
              : filter === 'mine'
                ? '내가 담당하는 진행 중 호출이 없습니다.'
                : '진행 중인 호출이 없습니다.'}
          </p>
        ) : (
          shown.map((c) => {
            const waited = nowMs - c.createdAt
            const urgent = c.status === 'waiting' && waited >= URGENT_MS
            const isSel = selected?.id === c.id
            const busy = c.status === 'in_progress'
            return (
              <button
                key={c.id}
                type="button"
                className={`call-row${isSel ? ' on' : ''}${urgent ? ' urgent' : ''}${busy ? ' busy' : ''}`}
                onClick={() => setSelectedId(c.id)}
                aria-pressed={isSel}
              >
                <span className="call-avatar">{shortTeam(c.team)}</span>
                <span className="call-body">
                  <span className="call-line">
                    <b className="call-team">팀 {c.team}</b>
                    <span className="call-ago">
                      {busy
                        ? `처리중${isHandledByMe(c, coach) ? ' · 나' : c.handledBy ? ` · ${c.handledBy}` : ''}`
                        : `${agoText(waited)} 대기`}
                    </span>
                  </span>
                  <span className="call-reason-line">{c.reason || '사유 미작성'}</span>
                </span>
                <Icon name="chevron" size={18} className="call-go" />
              </button>
            )
          })
        )}

        {/* 완료 이력은 기본으로 접어둡니다. 지금 갈 곳을 찾는 화면이라,
            끝난 일이 목록을 밀어내면 안 됩니다. */}
        {done.length > 0 && (
          <details className="fold">
            <summary className="fold-head">
              <Icon name="check" size={16} className="fold-icon" />
              <span className="fold-title">내가 완료한 호출 {done.length}건</span>
              <span className="fold-meta">
                {done[0]?.doneAt ? `최근 ${fmtTimeOnly(new Date(done[0].doneAt))}` : ''}
              </span>
              <Icon name="chevronDown" size={16} className="fold-caret" />
            </summary>
            <div className="fold-body">
              {done.map((c) => (
                <div key={c.id} className="done-row">
                  <span className="done-mark" aria-hidden="true">
                    <Icon name="check" size={15} />
                  </span>
                  <span className="done-body">
                    <span className="call-line">
                      <b className="done-team">팀 {c.team}</b>
                      <span className="done-when">
                        {c.doneAt ? `${fmtTimeOnly(new Date(c.doneAt))} 완료` : '완료'}
                        {c.doneAt ? ` · ${agoText(c.doneAt - c.createdAt)} 소요` : ''}
                      </span>
                    </span>
                    {c.reason && <span className="done-reason">{c.reason}</span>}
                    {teamLabel(c.team) && <span className="done-sub">{teamLabel(c.team)}</span>}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* 팀별 호출 횟수 — 내가 담당하는 팀만. 전체를 보는 건 총관리자뿐입니다. */}
        {showCounts && (
          <details className="fold">
            <summary className="fold-head">
              <Icon name="users" size={16} className="fold-icon" />
              <span className="fold-title">
                {showAllTeams ? '전체 팀 호출 횟수' : '내 담당 팀 호출 횟수'}
              </span>
              <span className="fold-meta">제한 {CALL_LIMIT_PER_TEAM}회</span>
              <Icon name="chevronDown" size={16} className="fold-caret" />
            </summary>
            <div className="fold-body">
              {countGroups.length === 0 ? (
                <p className="empty-text">
                  담당 팀이 배정되지 않았습니다. 진행 중인 호출은 위에서 모두 볼 수 있습니다.
                </p>
              ) : (
                countGroups.map(({ league, ids }) => (
                  <div key={league.id} className="league-block">
                    {countGroups.length > 1 && (
                      <div className="league-block-head">
                        {league.label} <span>{league.prefix}-</span>
                      </div>
                    )}
                    <div className="check-grid">
                      {ids.map((teamId) => {
                        const used = scan.counts[teamId] || 0
                        const full = used >= CALL_LIMIT_PER_TEAM
                        return (
                          <span
                            key={teamId}
                            className={`call-count-cell${used ? ' used' : ''}${full ? ' full' : ''}`}
                          >
                            {teamId.slice(2)}
                            <b>{used}</b>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </details>
        )}
      </div>

      <AdminDock onOpenMenu={onOpenMenu} menuAlert={menuAlert} menuOpen={menuOpen}>
        {!selected ? (
          <DockHint>호출을 선택하면 여기서 처리합니다</DockHint>
        ) : (
          <div className="dock-action">
            <div className="dock-target">
              <b>팀 {selected.team}</b>
              <span>
                {selected.status === 'in_progress'
                  ? `처리중${selected.startedAt ? ` · ${fmtTimeOnly(new Date(selected.startedAt))} 시작` : ''}${selected.handledBy ? ` · ${selected.handledBy}` : ''}`
                  : `선택됨 · ${agoText(nowMs - selected.createdAt)} 대기`}
              </span>
            </div>
            <div className="dock-buttons">
              {selected.status === 'waiting' ? (
                <button
                  type="button"
                  className="dock-btn primary"
                  onClick={() => onUpdateStatus(selected.team, selected.id, 'in_progress')}
                >
                  <Icon name="bell" size={19} />
                  처리 시작
                </button>
              ) : canControl(selected) ? (
                <>
                  {/* 잘못 누른 '처리 시작'을 되돌립니다. 되돌리지 못하면 그
                      호출이 대기 목록에서 사라지고, 슬랙 미처리 알림도
                      대기 상태만 보므로 아무 알림 없이 묻힙니다. */}
                  <button
                    type="button"
                    className="dock-btn ghost"
                    onClick={() => onUpdateStatus(selected.team, selected.id, 'waiting', selected)}
                    title="대기 상태로 되돌립니다"
                  >
                    <Icon name="undo" size={19} />
                    대기로
                  </button>
                  <button
                    type="button"
                    className="dock-btn done"
                    onClick={() => onUpdateStatus(selected.team, selected.id, 'done')}
                  >
                    <Icon name="check" size={19} />
                    완료 처리
                  </button>
                </>
              ) : (
                <DockHint>
                  {selected.handledBy || '다른 메이트'}가 처리 중입니다
                </DockHint>
              )}
            </div>
          </div>
        )}
      </AdminDock>
    </div>
  )
}
