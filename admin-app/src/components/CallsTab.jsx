import { useEffect, useState } from 'react'
import {
  CALL_LIMIT_PER_TEAM,
  COACH_ASSIGNMENTS,
  ALL_TEAM_IDS,
  groupByLeague,
  getAssignedCoachForTeam,
  crewFor,
  assignedCoachLabel,
  teamLabel,
  leagueAllowsCall,
} from '../config.js'
import { fmtTimeOnly } from '../lib/time.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { isHandledByMe } from '../lib/storage.js'

// 마스터 메이트 호출 알림 (PRD 5.3 + 요청 #5): 팀 번호 기준 마스터 메이트 개인별 배정.
// 내가 담당하는 팀의 호출을 우선 대응하되, 다른 마스터 메이트도 지원 가능.
// "내 담당 팀만" 필터로 담당 호출을 빠르게 걸러 처리.
export default function CallsTab({ scan, coach, onUpdateStatus }) {
  const [onlyMine, setOnlyMine] = useState(false)
  // 넓은 화면에서는 '완료 처리'를 '대기로' 옆에 둡니다. 자리가 넉넉해
  // 굳이 아래로 내릴 이유가 없고, 두 버튼이 붙어 있는 편이 찾기 쉽습니다.
  // 폰에서는 한 줄에 들어가지 않아 사유 아래 전폭 버튼으로 내립니다.
  const wideEnough = useMediaQuery('(min-width: 561px)')
  // 팀명은 있으면 좋지만 없어도 되는 정보라, 확실히 자리가 남을 때만 넣습니다.
  // 가장 긴 팀명(19자·206px)이 처리중 카드(버튼 둘)와 한 줄에 들어가려면
  // 머리줄에 630px이 필요합니다. 좌측 메뉴와 여백을 빼면 창이 약 990px —
  // 글꼴이 조금 커져도 버티도록 1100px부터 보여줍니다.
  // 그 아래에서는 넣지 않습니다. 억지로 넣으면 줄이 갈라지거나 담당 이름이 잘립니다.
  const roomForTeamName = useMediaQuery('(min-width: 1100px)')
  // 총관리자는 담당 구간이 없어 '내 담당 팀만'이 쓸모가 없습니다. 대신 아무도
  // 갈 사람이 없는 호출만 추려 봅니다 — 실제로 개입해야 하는 건 그것뿐입니다.
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  // 접수 시각은 고정된 값이라 1초마다 다시 그릴 이유가 없습니다.
  // (전에는 경과 시간을 흘려보내느라 초마다 화면 전체를 다시 그렸습니다)
  // 화면에는 닉네임까지, 짝 비교에는 이름만 씁니다. 표기를 그대로 비교하면
  // 닉네임이 없는 분(캐롯글로벌)과 있는 분의 형식이 달라 어긋납니다.
  const assignedNameOf = (teamId) => getAssignedCoachForTeam(teamId)?.name || ''
  const assignedLabelOf = (teamId) => assignedCoachLabel(teamId) || '미배정'

  const all = Object.entries(scan.calls).flatMap(([teamId, data]) =>
    (data.calls || []).map((c) => ({
      ...c,
      team: teamId,
      assignedName: assignedNameOf(teamId),
      assignedLabel: assignedLabelOf(teamId),
    })),
  )
  let active = all.filter((c) => c.status !== 'done')
  // 내 담당 호출을 먼저 정렬 → 그다음 오래된 순
  active.sort((a, b) => {
    const am = a.assignedName === coach.name ? 0 : 1
    const bm = b.assignedName === coach.name ? 0 : 1
    if (am !== bm) return am - bm
    return a.createdAt - b.createdAt
  })
  // 완료 이력은 내가 처리한 것만. 전원 이력이 섞이면 40명 규모에서 목록이
  // 길어지고, 정작 "내가 뭘 처리했는지" 확인이 어려워짐.
  const done = all
    .filter((c) => c.status === 'done' && isHandledByMe(c, coach))
    .sort((a, b) => b.doneAt - a.doneAt)

  const shown = active.filter((c) => {
    if (onlyMine && c.assignedName !== coach.name) return false
    if (onlyUnassigned && c.assignedName) return false
    return true
  })

  // 호출 횟수는 내 담당 팀만 봅니다. 남의 담당 팀 잔여 횟수는 내가 판단할
  // 일이 아니고, 메이트에게 다른 팀 정보가 필요한 곳은 '진행 중인 호출'뿐입니다.
  // 전체를 보는 건 총관리자(callManager)뿐입니다.
  const myAssignment = crewFor(coach)
  const myTeams = myAssignment?.teamNumbers || []
  const showAllTeams = !!myAssignment?.callManager
  // 팀 번호는 'E-45' 같은 문자열입니다. 리그가 다르면 같은 숫자라도 다른 팀이라
  // 격자도 리그별로 나눠 그립니다.
  // 호출을 쓰지 않는 리그(개발자리그)는 격자에서 뺍니다 — 늘 0인 칸 30개가
  // 자기 팀을 찾는 데 방해만 됩니다
  const countGroups = groupByLeague(
    (showAllTeams ? ALL_TEAM_IDS : myTeams).filter(leagueAllowsCall),
  )
  // 식음 운영처럼 담당 구간이 아예 없는 역할에는 이 패널이 늘 비어 있습니다.
  // 배정을 기다리는 메이트에게는 안내가 필요하지만, 그분에게는 군더더기입니다.
  const showCounts = showAllTeams || myTeams.length > 0 || !myAssignment?.orderManager

  return (
    <div>
      <section className="panel">
        <div className="panel-head-row">
          <h3>진행 중인 호출 ({shown.length}건)</h3>
          <div className="call-filters">
            {/* 담당 구간이 있는 사람에게만 의미가 있습니다 */}
            {myTeams.length > 0 && (
              <label className="mine-toggle">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                />
                내 담당 팀만
              </label>
            )}
            {/* 총관리자 전용 — 담당자가 없어 아무도 가지 않을 호출만 */}
            {showAllTeams && (
              <label className="mine-toggle">
                <input
                  type="checkbox"
                  checked={onlyUnassigned}
                  onChange={(e) => setOnlyUnassigned(e.target.checked)}
                />
                미배정만
              </label>
            )}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="empty-text">
            {onlyUnassigned
              ? '담당자가 없는 호출이 없습니다.'
              : onlyMine
                ? '내가 담당하는 진행 중 호출이 없습니다.'
                : '진행 중인 호출이 없습니다.'}
          </p>
        ) : (
          <div className="call-list">
            {shown.map((c) => {
              const mine = c.assignedName === coach.name
              const canControl = isHandledByMe(c, coach) || !!myAssignment?.callManager
              return (
                <div key={c.id} className={`call-card ${c.status}${mine ? ' mine-company' : ''}`}>
                  {/* 팀 번호 · 담당 · 현황 · 버튼 하나를 한 줄에 둡니다.
                      좁아지면 담당 이름만 줄어듭니다(말줄임) — 팀 번호와
                      버튼은 어떤 폭에서도 잘리면 안 되는 정보입니다.
                      접수 시각은 사유 줄로 내렸습니다. 폰에서 다섯 항목을
                      한 줄에 넣으면 버튼이 카드 밖으로 밀려납니다. */}
                  <div className="call-head">
                    <span className="call-table">팀 {c.team}</span>
                    {/* 팀명은 자리가 있을 때만 넣습니다. 폰에서는 번호·담당·현황·버튼만으로
                        이미 꽉 차서, 넣으면 줄이 갈라집니다 */}
                    {roomForTeamName && teamLabel(c.team) && (
                      <span className="call-team-name">{teamLabel(c.team)}</span>
                    )}
                    <span className={`call-company${mine ? ' mine' : ''}`}>{c.assignedLabel}</span>
                    {c.status === 'waiting' ? (
                      <>
                        <span className="status-pill waiting">대기중</span>
                        <span className="call-actions">
                          <button
                            className="btn-primary sm"
                            onClick={() => onUpdateStatus(c.team, c.id, 'in_progress')}
                          >
                            처리 시작
                          </button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="status-pill in-progress">
                          처리중{isHandledByMe(c, coach) ? ' (나)' : c.handledBy ? ` · ${c.handledBy}` : ''}
                        </span>
                        {/* 잘못 누른 '처리 시작'을 되돌립니다. 되돌리지 못하면 그
                            호출이 대기 목록에서 사라지고, 슬랙 미처리 알림도
                            대기 상태만 보므로 아무 알림 없이 묻힙니다.
                            '처리 시작'이 있던 자리를 그대로 물려받습니다. */}
                        {canControl && (
                          <span className="call-actions">
                            <button
                              className="btn-ghost sm call-revert"
                              onClick={() => onUpdateStatus(c.team, c.id, 'waiting', c)}
                              title="대기 상태로 되돌립니다"
                            >
                              대기로
                            </button>
                            {wideEnough && (
                              <button
                                className="btn-secondary sm"
                                onClick={() => onUpdateStatus(c.team, c.id, 'done')}
                              >
                                완료 처리
                              </button>
                            )}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {/* 참가자가 작성한 호출 사유 — 이동 전에 상황을 파악하도록 카드 전체 폭으로 표시 */}
                  <p className={`call-reason${c.reason ? '' : ' empty'}`}>
                    <span className="call-at">{fmtTimeOnly(new Date(c.createdAt))}</span>
                    {c.reason ? `“${c.reason}”` : '사유 미작성'}
                  </p>
                  {/* 폰에서는 머리줄에 버튼 둘이 들어가지 않습니다. 완료는 카드를
                      끝내는 동작이라 사유를 읽은 다음 자리가 순서에도 맞고,
                      폭을 꽉 채우면 장갑 낀 손으로도 누를 수 있습니다. */}
                  {c.status !== 'waiting' && canControl && !wideEnough && (
                    <button
                      className="btn-secondary call-done-btn"
                      onClick={() => onUpdateStatus(c.team, c.id, 'done')}
                    >
                      완료 처리
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <details className="panel done-panel">
        <summary>내가 완료한 호출 ({done.length}건)</summary>
        <div className="call-list">
          {done.map((c) => (
            <div key={c.id} className="call-card done">
              <div className="call-head">
                <span className="call-table">팀 {c.team}</span>
                {/* 팀명은 자리가 있을 때만 넣습니다. 폰에서는 번호·담당·현황·버튼만으로
                    이미 꽉 차서, 넣으면 줄이 갈라집니다 */}
                {roomForTeamName && teamLabel(c.team) && (
                  <span className="call-team-name">{teamLabel(c.team)}</span>
                )}
                <span className="call-company">{c.assignedLabel}</span>
                <span className="status-pill done-pill">
                  {fmtTimeOnly(new Date(c.createdAt))} →{' '}
                  {c.doneAt ? fmtTimeOnly(new Date(c.doneAt)) : '-'}
                </span>
              </div>
              {c.reason && <p className="call-reason">“{c.reason}”</p>}
            </div>
          ))}
        </div>
      </details>

      {/* 팀별 호출 횟수 — 내가 담당하는 팀만. 남의 담당 팀 잔여 횟수는
          내가 판단할 일이 아니고, 135칸을 훑으면 내 팀을 못 찾음.
          전체를 보는 건 총관리자뿐입니다. */}
      {showCounts && (
      <details className="panel done-panel">
        <summary>
          {showAllTeams ? '전체 팀 호출 횟수' : '내 담당 팀 호출 횟수'} (제한{' '}
          {CALL_LIMIT_PER_TEAM}회)
        </summary>
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
      </details>
      )}
    </div>
  )
}
