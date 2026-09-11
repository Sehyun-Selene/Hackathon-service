import { useState } from 'react'
import {
  teamLabel,
  assignedCoachLabel,
  leagueAllowsCall,
  wifiForTeam,
  wifiZonesForSeat,
  WIFI_LOUNGES,
} from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

// 클립보드에 넣습니다.
//
// navigator.clipboard 는 https(와 localhost)에서만 있습니다. 행사장에서
// 참가자가 여는 주소는 https라 괜찮지만, 같은 와이파이로 띄운 개발 서버
// (http://172.16.x.x)에서는 아예 없습니다. 그 경우 옛 방식으로 넘어갑니다.
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 권한 거부 — 아래 옛 방식으로 한 번 더 시도합니다 */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    // 화면 밖에 두되 포커스는 갈 수 있어야 복사가 됩니다
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

// Wi-Fi 한 줄. 비밀번호는 눌러서 복사합니다 — 여덟 자리를 폰 키보드로
// 옮겨 적다가 틀리면 어디를 틀렸는지도 모릅니다.
function WifiRow({ zone, primary = false }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const ok = await copyText(zone.pw)
    // 실패해도 비밀번호는 그대로 보이니 옮겨 적으면 됩니다. 다만 눌렀는데
    // 아무 일도 안 일어난 것처럼 보이지 않게, 실패도 말해 줍니다.
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(false), 1600)
  }
  // 두 칸 다 무엇인지 적어둡니다. 값만 있으면 오른쪽 네모가 비밀번호인지
  // 다른 이름인지 알 수 없어, 폰의 와이파이 목록과 대조하기 어렵습니다.
  return (
    <div className={`wifi-row${primary ? ' primary' : ''}`}>
      <span className="wifi-ssid">
        <i className="wifi-key">네트워크 이름</i>
        <b>{zone.id}</b>
        <small>{zone.area}</small>
      </span>
      <button
        type="button"
        className={`wifi-pw${copied === 'ok' ? ' copied' : ''}${copied === 'fail' ? ' failed' : ''}`}
        onClick={copy}
        aria-label={`${zone.id} 비밀번호 ${zone.pw} 복사`}
      >
        <i className="wifi-key">비밀번호</i>
        <b>{copied === 'ok' ? '복사됨' : copied === 'fail' ? '직접 입력' : zone.pw}</b>
      </button>
    </div>
  )
}

export default function TeamInfoSheet({ team, onClose, onEdit, onGuide }) {
  const allergyGroups = (team.allergies || []).filter(
    (group) => Array.isArray(group) && group.length > 0,
  )
  // 담당 마스터 메이트는 우리 팀에 딸린 정보라 팀 정보 안에 둡니다.
  // 호출 화면 위에 따로 한 칸을 두면, 정작 읽어야 할 호출 전 안내가
  // 화면 밖으로 밀려 스크롤해야 보입니다.
  // 호출을 쓰지 않는 리그(개발자리그)에는 담당 자체가 없습니다.
  const coach = leagueAllowsCall(team.teamId) ? assignedCoachLabel(team.teamId) : null
  const myWifi = wifiForTeam(team.teamId)
  const seatZones = wifiZonesForSeat(team.teamId)
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

        {/* 행사장 Wi-Fi.
            구역마다 비밀번호가 달라서, 포스터를 보고 "내 자리가 어느 구역인지"를
            스스로 찾아야 했습니다. 팀 번호는 앱이 이미 아니까 우리 구역만
            바로 띄웁니다. 자리 구역을 모르는 팀에는 같은 홀의 구역 목록을
            보여줍니다 — 틀린 비밀번호를 자신 있게 띄우는 것보다 낫습니다. */}
        <div className="wifi-block">
          <div className="wifi-head">
            <span className="wifi-title">행사장 Wi-Fi</span>
            {myWifi && <span className="wifi-badge">우리 자리</span>}
          </div>
          {myWifi ? (
            <WifiRow zone={myWifi} primary />
          ) : (
            <>
              <p className="wifi-note">
                자리 구역이 확인되지 않았습니다. 테이블에 붙은 안내에서 우리 구역을
                확인하고 아래에서 고르세요.
              </p>
              {seatZones.map((z) => (
                <WifiRow key={z.id} zone={z} />
              ))}
            </>
          )}
          <div className="wifi-lounges">
            <span className="wifi-sub">공용 구역</span>
            {WIFI_LOUNGES.map((z) => (
              <WifiRow key={z.id} zone={z} />
            ))}
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
