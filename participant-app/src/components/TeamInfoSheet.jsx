import { teamLabel } from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

export default function TeamInfoSheet({ team, onClose, onEdit }) {
  const allergyGroups = (team.allergies || []).filter(
    (group) => Array.isArray(group) && group.length > 0,
  )
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

        <button className="btn-primary team-sheet-edit" onClick={onEdit}>
          팀 정보 편집
        </button>
      </section>
    </div>
  )
}
