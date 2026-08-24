import { useEffect } from 'react'
import { useSheetDrag } from '../lib/useSheetDrag.js'

export default function TeamInfoSheet({ team, onClose, onEdit }) {
  const allergyGroups = (team.allergies || []).filter(
    (group) => Array.isArray(group) && group.length > 0,
  )
  const drag = useSheetDrag(onClose)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => event.key === 'Escape' && onClose()

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div className="team-sheet-backdrop" onClick={onClose}>
      <section
        className="team-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-sheet-title"
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
          <div className="team-sheet-row">
            <span>팀원 수</span>
            <strong>{team.memberCount}명</strong>
          </div>
          <div className="team-sheet-allergies">
            <span>알러지 정보</span>
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
