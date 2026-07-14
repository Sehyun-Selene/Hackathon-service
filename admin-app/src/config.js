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
export const API_BASE_URL = 'https://hackathon-service-6uf0.onrender.com'

// ---------------------------------------------------------------
// 1. 식사별 주문 가능 시간 / 식사(먹는) 시각  (TBD — 현재 임시값)
//    - orderStart ~ orderEnd : 주문 가능(메뉴판 노출·수정·취소 가능) 구간
//    - eatAt                 : 식사 시각. 주문 내역은 orderStart부터
//                              eatAt까지 참가자 화면에 노출됨 (PRD 4.2)
//    - 시각 문자열은 로컬 시간(KST 기기 기준)으로 해석됩니다.
// ---------------------------------------------------------------
export const MEALS = [
  {
    id: 'dinner',
    label: '저녁',
    orderStart: '2026-09-21T14:00:00',
    orderEnd: '2026-09-21T16:00:00',
    eatAt: '2026-09-21T18:00:00',
  },
  {
    id: 'midnight',
    label: '야식',
    orderStart: '2026-09-21T17:00:00',
    orderEnd: '2026-09-21T19:00:00',
    eatAt: '2026-09-21T21:00:00',
  },
  {
    id: 'breakfast',
    label: '아침',
    orderStart: '2026-09-21T20:00:00',
    orderEnd: '2026-09-21T22:00:00',
    eatAt: '2026-09-22T09:00:00',
  },
]

// ---------------------------------------------------------------
// 2. 코치 호출  (TBD)
// ---------------------------------------------------------------
// 팀당 호출 가능 총 횟수 — 초과 시 호출 버튼 자동 비활성화
export const CALL_LIMIT_PER_TEAM = 5

// 호출 사유 목록 (TBD — 현재 임시 설정)
export const CALL_REASONS = ['멘토링 요청', '기술 문제', '기타']

// ---------------------------------------------------------------
// 3. 코치별 담당 팀 번호  (TBD — 팀 편성 확정 후 채우기)
//    참가자는 계열사를 고르지 않고 팀 번호만 입력합니다. 대신 "어느 코치가
//    어느 팀을 담당하는지"를 이 목록으로 미리 정해둡니다.
//    - teamNumbers: 그 조가 담당하는 팀 번호(숫자) 배열. 지금은 비어 있어서
//      아직 아무 팀도 배정 안 된 상태 — 확정되면 숫자만 채우면 됩니다.
//      예: teamNumbers: [1, 2, 3, 4, 5]
//    - 코치는 입장 시 이 목록 중 자신이 맡은 조를 선택합니다.
//    - 조 개수 자체도 자유롭게 늘리거나 줄일 수 있습니다 (지금은 4조 기준).
// ---------------------------------------------------------------
export const COACH_GROUPS = [
  { id: 'group-1', label: '1조', teamNumbers: [] },
  { id: 'group-2', label: '2조', teamNumbers: [] },
  { id: 'group-3', label: '3조', teamNumbers: [] },
  { id: 'group-4', label: '4조', teamNumbers: [] },
]

// ---------------------------------------------------------------
// 4. 알러지 선택지  (TBD)
//    흔한 항목은 선택지로 제공하고, 없으면 참가자가 직접 입력.
//    ※ 알러지 대응 메뉴를 미리 준비하는 게 아니라, 여기서 수집한
//      현황을 관리자가 확인해 대체 메뉴를 준비하는 방식입니다.
//    ※ 저장 형태: team.allergies = [[사람1의 알러지...], [사람2의 알러지...]]
//      (사람 단위로 배열을 나눠 저장 — 1명이 여러 개인지 여러 명이 각각
//      하나씩인지에 따라 대체 메뉴 준비 개수/조합이 달라지기 때문)
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
export const TOTAL_TEAMS = 125 // 최대 참가팀 수 (팀 번호 01~125)
export const MAX_MEMBER_COUNT = 10 // 인원수 입력 상한
export const PARTICIPANT_POLL_MS = 5000 // 참가자 화면 폴링 주기
export const ADMIN_POLL_MS = 3000 // 관리자 화면 폴링 주기 (호출 알림 포함)

// 참가자 화면 다크모드 시간대 (밤 20시 ~ 아침 7시 — 야식/새벽 눈부심 방지)
export const DARK_MODE_HOURS = { start: 20, end: 7 }

// ---------------------------------------------------------------
// 6. 메뉴  (임시 샘플 — 케이터링 확정 후 교체)
//    category   : 'food'(음식) | 'drink'(음료)
//    badges     : 비건/알러지 등 식이 정보 뱃지 (메뉴 옆 표시 — 유지)
//    image      : 음식 사진 URL (TBD — 확정 후 채우기. 비면 플레이스홀더 표시)
//    allergyNote: 알러지 상세 설명 (TBD — 확정 후 채우기. 뱃지 외 추가 안내)
// ---------------------------------------------------------------
export const MENUS = {
  dinner: [
    { id: 'dn-jjajang', name: '짜장면', category: 'food', badges: ['⚠️ 밀가루'], image: '', allergyNote: '' },
    { id: 'dn-jjamppong', name: '짬뽕', category: 'food', badges: ['⚠️ 새우·조개'], image: '', allergyNote: '' },
    { id: 'dn-tangsuyuk', name: '탕수육', category: 'food', badges: ['⚠️ 돼지고기'], image: '', allergyNote: '' },
    { id: 'dn-vegan-bowl', name: '비건 야채덮밥', category: 'food', badges: ['🌱 비건'], image: '', allergyNote: '' },
    { id: 'dn-cola', name: '콜라', category: 'drink', badges: [], image: '', allergyNote: '' },
    { id: 'dn-cider', name: '사이다', category: 'drink', badges: [], image: '', allergyNote: '' },
    { id: 'dn-zero', name: '제로콜라', category: 'drink', badges: [], image: '', allergyNote: '' },
  ],
  midnight: [
    { id: 'md-chicken', name: '후라이드 치킨', category: 'food', badges: ['⚠️ 닭고기'], image: '', allergyNote: '' },
    { id: 'md-pizza', name: '페퍼로니 피자', category: 'food', badges: ['⚠️ 유제품'], image: '', allergyNote: '' },
    { id: 'md-tteokbokki', name: '로제 떡볶이', category: 'food', badges: ['⚠️ 유제품', '🌶️ 매움'], image: '', allergyNote: '' },
    { id: 'md-fries', name: '비건 감자튀김', category: 'food', badges: ['🌱 비건'], image: '', allergyNote: '' },
    { id: 'md-cola', name: '콜라', category: 'drink', badges: [], image: '', allergyNote: '' },
    { id: 'md-americano', name: '아이스 아메리카노', category: 'drink', badges: [], image: '', allergyNote: '' },
    { id: 'md-ion', name: '이온음료', category: 'drink', badges: [], image: '', allergyNote: '' },
  ],
  breakfast: [
    { id: 'bf-sandwich', name: '에그 샌드위치', category: 'food', badges: ['⚠️ 계란·우유'], image: '', allergyNote: '' },
    { id: 'bf-gimbap', name: '참치 김밥', category: 'food', badges: ['⚠️ 참치'], image: '', allergyNote: '' },
    { id: 'bf-croissant', name: '크루아상', category: 'food', badges: ['⚠️ 글루텐·버터'], image: '', allergyNote: '' },
    { id: 'bf-fruit', name: '비건 과일컵', category: 'food', badges: ['🌱 비건'], image: '', allergyNote: '' },
    { id: 'bf-oj', name: '오렌지주스', category: 'drink', badges: [], image: '', allergyNote: '' },
    { id: 'bf-soymilk', name: '두유', category: 'drink', badges: ['🌱 비건'], image: '', allergyNote: '' },
    { id: 'bf-coffee', name: '따뜻한 아메리카노', category: 'drink', badges: [], image: '', allergyNote: '' },
  ],
}

// ---------------------------------------------------------------
// (파생 값 — 수정하지 마세요)
// ---------------------------------------------------------------
export const ALL_MENUS = Object.values(MENUS).flat()
export const MENU_BY_ID = Object.fromEntries(ALL_MENUS.map((m) => [m.id, m]))
export const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]))

// 팀 번호로 담당 코치 조를 찾음 (COACH_GROUPS.teamNumbers가 비어있으면 null → 미배정)
export function getCoachGroupForTeam(teamId) {
  const n = parseInt(teamId, 10)
  if (!Number.isFinite(n)) return null
  return COACH_GROUPS.find((g) => g.teamNumbers.includes(n)) || null
}
