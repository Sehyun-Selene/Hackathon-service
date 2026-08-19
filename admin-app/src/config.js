// =====================================================================
//  ⚙️ 서비스 설정 파일 — PRD에서 TBD(추후 확정)로 표시된 값 모음
//
//  값이 확정되면 "이 파일만" 수정하면 됩니다. 코드 어디에도 하드코딩 없음.
//
//  ⚠️ 중요: participant-app/src/config.js 와 admin-app/src/config.js 는
//     반드시 동일한 내용으로 유지하세요. 두 앱은 코드베이스가 완전히
//     분리되어 있어 한쪽만 고치면 두 화면의 동작이 서로 어긋납니다.
// =====================================================================

// ---------------------------------------------------------------
// 0. 공유 API 서버 주소
//    참가자 앱과 관리자 앱은 서로 다른 배포 URL(다른 origin)이므로,
//    데이터를 주고받으려면 이 작은 공유 서버(shared-api/)를 거칩니다.
//    → shared-api를 Render/Railway 등에 배포한 뒤, 그 주소로 교체하세요.
//    → 비워두면('') 이 기기(브라우저)의 localStorage만 사용합니다
//      (다른 사람 화면과 공유되지 않음 — 로컬 개발/시연용).
// ---------------------------------------------------------------
export const API_BASE_URL = 'https://hackathon-api-hi55.onrender.com'

// ---------------------------------------------------------------
// 1. 주문 타임라인  (날짜/식사 시각은 TBD — 현재 임시값)
//
//    주문은 첫날 딱 한 번만 받습니다:
//      ① 14:00~15:00 → 야식·아침 한 번에 주문 (각 2가지 메뉴 중 선택)
//    이후/이외에는 주문 기능이 없습니다:
//      - 간식·저녁: 주문 없이 인원수 기준 일괄 제공
//      - 둘째 날 점심·이후 아이스크림: 인원수 기준 일괄 제공
//      - 음료: 냉장고에서 자율적으로 가져감 (주문 없음)
//
//    - label                 : 식사 이름 (식사 탭·장바구니·관리자 화면 표기)
//    - shortLabel            : 주문 화면 제목에 쓰는 짧은 이름. 없으면 label 사용.
//    - orderStart ~ orderEnd : 주문 가능(메뉴판 노출·수정·취소 가능) 구간
//      (여러 식사가 같은 구간을 공유하면 한 화면에서 탭으로 함께 주문)
//    - eatAt                 : 식사 시각. 주문 내역은 orderStart부터
//                              eatAt까지 참가자 화면에 노출됨
//    - fixedMenu             : true면 일괄 메뉴(선택 없이 수량만 담음)
//    - 시각 문자열은 로컬 시간(KST 기기 기준)으로 해석됩니다.
// ---------------------------------------------------------------
export const MEALS = [
  {
    id: 'midnight',
    label: 'DAY 1 야식',
    shortLabel: '야식',
    orderStart: '2026-09-21T14:00:00',
    orderEnd: '2026-09-21T15:00:00',
    eatAt: '2026-09-21T21:00:00',
  },
  {
    id: 'breakfast',
    label: 'DAY 2 아침',
    shortLabel: '아침',
    orderStart: '2026-09-21T14:00:00',
    orderEnd: '2026-09-21T15:00:00',
    eatAt: '2026-09-22T09:30:00',
  },
]

// ---------------------------------------------------------------
// 2. 마스터 메이트 호출
//    호출 사유 선택 없음 — 버튼 한 번으로 바로 호출됩니다.
// ---------------------------------------------------------------
// 팀당 호출 가능 총 횟수 (확정: 5회) — 초과 시 호출 버튼 자동 비활성화
export const CALL_LIMIT_PER_TEAM = 5

// ---------------------------------------------------------------
// 3. 마스터 메이트 개인별 담당 팀 번호  (TBD — 명단·팀 편성 확정 후 채우기)
//    참가자는 팀 번호만 입력합니다. "어느 마스터 메이트가 어느 팀을 담당하는지"를
//    개인 단위로 미리 정해둡니다. (코드 내부 식별자는 coach를 유지)
//    - name       : 마스터 메이트 이름. 명단이 아직 미확정이라 지금은 빈 값(TBD).
//                   확정되면 이름을 채우세요 (예: '김민준').
//    - teamNumbers: 그 마스터 메이트가 담당하는 팀 번호(숫자) 배열.
//                   예: teamNumbers: [1, 2, 3, 4, 5]
//    - 마스터 메이트는 관리자 앱 입장 시 이름을 직접 입력합니다. 여기 채워둔
//      이름과 정확히 같은 글자로 입력해야 담당 팀이 자동으로 연결됩니다.
//    - 인원 자체도 확정 전이라, 배열에 항목을 자유롭게 추가/삭제하면
//      됩니다 (지금은 자리 4개만 미리 만들어둔 상태).
// ---------------------------------------------------------------
export const COACH_ASSIGNMENTS = [
  { id: 'coach-1', name: '', teamNumbers: [] },
  { id: 'coach-2', name: '', teamNumbers: [] },
  { id: 'coach-3', name: '', teamNumbers: [] },
  { id: 'coach-4', name: '', teamNumbers: [] },
]

// ---------------------------------------------------------------
// 4. 알러지 선택지  (TBD)
//    흔한 항목은 선택지로 제공하고, 없으면 참가자가 직접 입력.
//    ※ 알러지 대응 메뉴를 미리 준비하는 게 아니라, 여기서 수집한
//      현황을 운영진이 확인해 대체 메뉴를 준비하는 방식입니다.
//    ※ 저장 형태: team.allergies = [[사람1의 알러지...], [사람2의 알러지...]]
//      (사람 단위로 배열을 나눠 저장 — 1명이 여러 개인지 여러 명이 각각
//      하나씩인지에 따라 대체 메뉴 준비 개수/조합이 달라지기 때문)
//    ※ 아래 MENUS의 allergens와 같은 표기를 쓰면, 팀 등록 시 입력한
//      알러지가 메뉴 성분과 겹치는 인원을 관리자 화면에서 자동 집계합니다.
// ---------------------------------------------------------------
export const ALLERGY_OPTIONS = [
  '계란',
  '우유',
  '땅콩',
  '견과류',
  '갑각류(새우·게)',
  '밀',
  '대두',
  '메밀',
  '생선',
  '복숭아',
  '돼지고기',
  '닭고기',
]

// ---------------------------------------------------------------
// 5. 규모 · 운영 상수
// ---------------------------------------------------------------
export const TOTAL_TEAMS = 125 // TBD: 최종 참가팀 수 (팀 번호 01~125)
export const DELIVERY_TEAM_RANGE_SIZE = 25 // TBD: 관리자 배부 화면의 팀 번호 구간 크기
export const MAX_MEMBER_COUNT = 10 // 인원수 입력 상한
export const PARTICIPANT_POLL_MS = 5000 // 참가자 화면 폴링 주기
export const ADMIN_POLL_MS = 3000 // 관리자 화면 폴링 주기 (호출 알림 포함)

// 참가자 화면 다크모드 시간대 (밤 20시 ~ 아침 7시 — 야식/새벽 눈부심 방지)
export const DARK_MODE_HOURS = { start: 20, end: 7 }

// ---------------------------------------------------------------
// 6. 메뉴  (이름은 전부 TBD — 케이터링 확정 후 교체)
//    음료는 냉장고 자율 이용이라 메뉴에 없습니다. 전부 음식이며,
//    식사(끼니)마다 팀 인원수만큼만 담을 수 있습니다.
//    badges     : 메뉴 카드에 표시되는 식이 정보 뱃지 (예: '⚠️ 밀', '🌱 비건')
//    image      : 음식 사진 URL (TBD — 확정 후 채우기. 비면 플레이스홀더 표시)
//    allergyNote: 알러지 상세 설명 (TBD — 확정 후 채우기. 뱃지 외 추가 안내)
//    allergens  : 이 메뉴에 포함된 알러지 유발 성분 목록 (TBD).
//                 ⚠️ 반드시 ALLERGY_OPTIONS와 똑같은 표기로 적으세요.
//                 (예: allergens: ['밀', '계란'])
//                 팀 등록 알러지와 겹치는 인원을 관리자 화면에서 자동 집계합니다.
// ---------------------------------------------------------------
export const MENUS = {
  midnight: [
    { id: 'md-a', name: '야식 A (TBD)', badges: [], image: '', allergyNote: '', allergens: [] },
    { id: 'md-b', name: '야식 B (TBD)', badges: [], image: '', allergyNote: '', allergens: [] },
  ],
  breakfast: [
    { id: 'bf-a', name: '아침 A (TBD)', badges: [], image: '', allergyNote: '', allergens: [] },
    { id: 'bf-b', name: '아침 B (TBD)', badges: [], image: '', allergyNote: '', allergens: [] },
  ],
}

// ---------------------------------------------------------------
// (파생 값 — 수정하지 마세요)
// ---------------------------------------------------------------
export const ALL_MENUS = Object.values(MENUS).flat()
export const MENU_BY_ID = Object.fromEntries(ALL_MENUS.map((m) => [m.id, m]))
export const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]))

// 팀 번호로 담당 마스터 메이트를 찾음 (teamNumbers가 비어있으면 null → 미배정)
export function getAssignedCoachForTeam(teamId) {
  const n = parseInt(teamId, 10)
  if (!Number.isFinite(n)) return null
  return COACH_ASSIGNMENTS.find((c) => c.teamNumbers.includes(n)) || null
}

// teamNumbers 배열을 "1~25번" / "1~10, 30~32번" 같은 범위 문자열로 압축
// (연속 구간은 a~b로 묶음, 비어있으면 null → "미배정" 표시용)
export function formatTeamRange(teamNumbers) {
  const nums = [...(teamNumbers || [])].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!nums.length) return null
  const parts = []
  let start = nums[0]
  let prev = nums[0]
  for (let i = 1; i <= nums.length; i++) {
    if (i < nums.length && nums[i] === prev + 1) {
      prev = nums[i]
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}~${prev}`)
    if (i < nums.length) {
      start = nums[i]
      prev = nums[i]
    }
  }
  return `${parts.join(', ')}번`
}
