import Icon from './Icon.jsx'

// 화면 아래 고정 바.
//
// 이 앱을 쓰는 마스터 메이트는 행사장을 걸어 다니며 한 손으로 폰을 봅니다.
// 그래서 두 가지를 여기서 정합니다.
//
//   ① 동작은 전부 이 바 안에서만 일어납니다. 목록 카드는 고르기만 합니다.
//      걷다가 목록을 스치면 '처리 시작'이 눌리는데, 되돌릴 수는 있어도
//      그 사이 슬랙 미처리 알림이 멎어 호출이 조용히 묻힙니다.
//   ② 메뉴(☰)도 여기 왼쪽에 붙습니다. 예전에는 화면 위에서 눌렀는데
//      서랍은 아래에서 올라와, 누른 곳과 열리는 곳이 어긋났습니다.
//      이제 올라오는 자리에서 눌립니다.
//
// 오른쪽(children)은 화면마다 다릅니다 — 호출 화면은 처리 버튼, 메이트
// 현황은 갱신 시각. 자리와 높이(56px)는 어느 화면에서나 같아서, 손이
// 가는 위치가 학습됩니다.
export default function AdminDock({
  onOpenMenu,
  menuAlert = false,
  menuOpen = false,
  // 갈 수 있는 화면이 하나뿐이면 메뉴 자체가 필요 없습니다 (식음 운영).
  showMenu = true,
  // 버튼 줄 위에 폭을 다 쓰는 한 줄. 지금 무엇을 대상으로 누르는지 알려줍니다.
  // 이걸 ☰ 와 같은 줄에 넣으면 슬롯만 두 줄이 되어 버튼이 ☰ 보다 아래로
  // 내려갑니다 — 같은 줄에 있어야 할 것들이 어긋나 보입니다.
  lead = null,
  children,
}) {
  return (
    <div className="dock">
      {lead}
      <div className="dock-row">
        {showMenu && (
          <button
            type="button"
            className={`dock-menu${menuOpen ? ' on' : ''}`}
            onClick={onOpenMenu}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
            <span className="dock-menu-label">{menuOpen ? '닫기' : '메뉴'}</span>
            {/* 다른 화면에 볼 것이 생겼다는 표시 — 메뉴를 열어야 알 수 있으므로 */}
            {menuAlert && !menuOpen && <span className="dock-dot" aria-hidden="true" />}
          </button>
        )}
        <div className="dock-slot">{children}</div>
      </div>
    </div>
  )
}

// 고를 것이 없을 때의 빈 자리. 바를 비워두면 무엇을 해야 하는지 알 수
// 없어서, 다음 동작을 글로 적어 둡니다.
export function DockHint({ children }) {
  return <div className="dock-hint">{children}</div>
}
