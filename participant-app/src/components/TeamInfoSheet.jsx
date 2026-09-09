import { teamLabel, assignedCoachLabel, leagueAllowsCall } from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

export default function TeamInfoSheet({ team, onClose, onEdit, onGuide }) {
  const allergyGroups = (team.allergies || []).filter(
    (group) => Array.isArray(group) && group.length > 0,
  )
  // 담당 마스터 메이트는 우리 팀에 딸린 정보라 팀 정보 안에 둡니다.
  // 호출 화면 위에 따로 한 칸을 두면, 정작 읽어야 할 호출 전 안내가
  // 화면 밖으로 밀려 스크롤해야 보입니다.
  // 호출을 쓰지 않는 리그(개발자리그)에는 담당 자체가 없습니다.
  const coach = leagueAllowsCall(team.teamId) ? assignedCoachLabel(team.teamId) : null
  const drag = useSheetDrag(onClose)
  const dialogRef = useDialogFocus(true, onClose)

  return (
    <div className="team-sheet-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="team-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-sheet-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={drag.sheetStyle}
      >
        <div className="team-sheet-handle" aria-hidden="true" {...drag.handleHandlers} />
        <div className="team-sheet-head">
          <h2 id="team-sheet-title">팀 정보</h2>
          <button className="team-sheet-close" onClick={onClose}>닫기</button>
        </div>

        <div className="team-sheet-details">
          <div className="team-sheet-row">
            <span>팀 번호</span>
            <strong>팀 {team.teamId}</strong>
          </div>
          {/* 번호만 보면 우리 팀이 맞는지 확신이 서지 않습니다. 자리배치표에
              팀명이 함께 있으니 같이 보여줍니다. 외부사처럼 팀명이 아직
              정해지지 않은 경우에는 회사명이 대신 나옵니다(teamLabel). */}
          {teamLabel(team.teamId) && (
            <div className="team-sheet-row">
              <span>팀 이름</span>
              <strong>{teamLabel(team.teamId)}</strong>
            </div>
          )}
          <div className="team-sheet-row">
            <span>팀원 수</span>
            <strong>{team.memberCount}명</strong>
          </div>
          {coach && (
            <div className="team-sheet-row">
              <span>담당 마스터 메이트</span>
              <strong>{coach}</strong>
            </div>
          )}
          <div className="team-sheet-allergies">
            <span>알레르기 정보</span>
            {allergyGroups.length === 0 ? (
              <strong>없음</strong>
            ) : (
              <div className="team-sheet-allergy-list">
                {allergyGroups.map((group, index) => (
                  <div key={`${group.join('-')}-${index}`} className="team-sheet-allergy-group">
                    <b>팀원 {index + 1}</b>
                    <span>{group.join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 이용 안내는 첫 화면에서 한 번 읽고 지나가면 다시 볼 길이 없었습니다.
            팀 프로필은 어느 탭에서든 오른쪽 위에 있어, 다시 꺼내 보는
            입구로 여기가 가장 찾기 쉽습니다. */}
        <div className="team-sheet-actions">
          <button className="btn-ghost team-sheet-guide" onClick={onGuide}>
            📋 이용 안내 다시 보기
          </button>
          <button className="btn-primary team-sheet-edit" onClick={onEdit}>
            팀 정보 편집
          </button>
        </div>
      </section>
    </div>
  )
}
