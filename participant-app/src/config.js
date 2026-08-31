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
export const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL ?? 'https://hackathon-api-hi55.onrender.com'

// ---------------------------------------------------------------
// 1. 주문 타임라인  (주문 시간 확정: DAY 1 13:30~14:30)
//
//    주문은 첫날 딱 한 번만 받습니다:
//      ① 13:30~14:30 → 야식·아침 한 번에 주문 (각 2가지 메뉴 중 선택)
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
    label: '[DAY 1] 야식',
    shortLabel: '야식',
    orderStart: '2026-09-21T13:30:00',
    orderEnd: '2026-09-21T14:30:00',
    eatAt: '2026-09-21T21:00:00',
  },
  {
    id: 'breakfast',
    label: '[DAY 2] 아침',
    shortLabel: '아침',
    orderStart: '2026-09-21T13:30:00',
    orderEnd: '2026-09-21T14:30:00',
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
// 2-1. 리그와 팀 (자리배치 시트에서 옮김)
//
//   테이블에 붙은 번호가 그대로 팀 번호입니다 — 필드리그는 E-45,
//   개발자리그는 G-12. 접두어가 없으면 두 리그의 같은 번호가 한 팀으로
//   섞여 주문·호출이 엉킵니다.
//   리모트리그(O-)는 현장에 오지 않아 이 서비스를 쓰지 않습니다.
//
//   size = 그 팀의 인원. 주문 수량 상한으로 쓰입니다.
//     시트의 '인원' 열과 명단 이름 수가 다른 팀(E-40·E-75)은 큰 쪽을 썼습니다.
//     막아서 못 받는 것보다 한 개 남는 편이 낫기 때문입니다.
//   name = 팀명. 등록할 때 번호를 확인시켜 주는 용도입니다.
// ---------------------------------------------------------------
export const LEAGUES = [
  { id: 'field', prefix: 'E', label: '필드리그', count: 104 },
  { id: 'dev', prefix: 'G', label: '개발자리그', count: 31 },
]

export const TEAMS = {
  'E-01': { name: "어벤처스", size: 2 },
  'E-02': { name: "Grill Me", size: 3 },
  'E-03': { name: "오디세이", size: 2 },
  'E-04': { name: "CTRL + AI", size: 2 },
  'E-05': { name: "리투(Lee Two)", size: 2 },
  'E-06': { name: "KJ", size: 2 },
  'E-07': { name: "안녕하세요차지비입니다잘부탁드립니다.", size: 3 },
  'E-08': { name: "지금, 차지", size: 3 },
  'E-09': { name: "당진파파", size: 3 },
  'E-10': { name: "빌드업", size: 3 },
  'E-11': { name: "스마트스퀘어", size: 2 },
  'E-12': { name: "스마트터빈", size: 3 },
  'E-13': { name: "파도", size: 2 },
  'E-14': { name: "HOPE", size: 4 },
  'E-15': { name: "Jun & Kun", size: 2 },
  'E-16': { name: "고객운영팀", size: 3 },
  'E-17': { name: "서든어택", size: 4 },
  'E-18': { name: "성능주의", size: 4 },
  'E-19': { name: "파울링 헌터스", size: 4 },
  'E-20': { name: "20W50", size: 3 },
  'E-21': { name: "시고시고", size: 3 },
  'E-22': { name: "아장아장", size: 4 },
  'E-23': { name: "오뒷에이아이야", size: 3 },
  'E-24': { name: "지칼드림팀", size: 3 },
  'E-25': { name: "체크메이트", size: 3 },
  'E-26': { name: "컴플AI언스", size: 3 },
  'E-27': { name: "Bid-Tamin", size: 2 },
  'E-28': { name: "Fixipedia", size: 4 },
  'E-29': { name: "MOC MATE", size: 3 },
  'E-30': { name: "Pringles", size: 4 },
  'E-31': { name: "RA", size: 4 },
  'E-32': { name: "AIDEAL (에이디얼)", size: 4 },
  'E-33': { name: "기사회생", size: 4 },
  'E-34': { name: "보건보건", size: 3 },
  'E-35': { name: "AIgnition", size: 4 },
  'E-36': { name: "BID ONE(비드원)", size: 4 },
  'E-37': { name: "BS", size: 4 },
  'E-38': { name: "FanTAXtic", size: 2 },
  'E-39': { name: "GS 공구리에이티브", size: 4 },
  'E-40': { name: "MU", size: 3 },
  'E-41': { name: "Noise Huntrix", size: 3 },
  'E-42': { name: "XI-Nergy", size: 3 },
  'E-43': { name: "NARASEE", size: 3 },
  'E-44': { name: "Xisafety", size: 3 },
  'E-45': { name: "3삼5오", size: 4 },
  'E-46': { name: "강동어겐", size: 4 },
  'E-47': { name: "김이조장", size: 4 },
  'E-48': { name: "딱걸렸4", size: 4 },
  'E-49': { name: "리스크 제로", size: 4 },
  'E-50': { name: "미녀사총사", size: 4 },
  'E-51': { name: "불티를깨워", size: 2 },
  'E-52': { name: "블랙핑크", size: 4 },
  'E-53': { name: "뽀삐", size: 2 },
  'E-54': { name: "세끼통역", size: 3 },
  'E-55': { name: "수퍼프롬프트", size: 2 },
  'E-56': { name: "신선강화B", size: 4 },
  'E-57': { name: "신선강화C", size: 3 },
  'E-58': { name: "안AI잘부", size: 4 },
  'E-59': { name: "온앤오프", size: 3 },
  'E-60': { name: "우연이연", size: 4 },
  'E-61': { name: "커넥트 you & me", size: 3 },
  'E-62': { name: "커타고", size: 4 },
  'E-63': { name: "햄샘수", size: 3 },
  'E-64': { name: "홈동이들", size: 4 },
  'E-65': { name: "효리수", size: 4 },
  'E-66': { name: "Audit Say (오디세이)", size: 4 },
  'E-67': { name: "GiveS", size: 4 },
  'E-68': { name: "HiAi", size: 4 },
  'E-69': { name: "HLH컴퍼니", size: 3 },
  'E-70': { name: "SO, GOOD", size: 3 },
  'E-71': { name: "Team Argo", size: 4 },
  'E-72': { name: "Team Hermes", size: 4 },
  'E-73': { name: "VOC세편살", size: 3 },
  'E-74': { name: "끝까지 버팀", size: 3 },
  'E-75': { name: "구미 야호", size: 3 },
  'E-76': { name: "FC동해", size: 2 },
  'E-77': { name: "위험한팀", size: 2 },
  'E-78': { name: "공하Z", size: 2 },
  'E-79': { name: "미철즈", size: 2 },
  'E-80': { name: "신림파", size: 3 },
  'E-81': { name: "DNA (Dining Needs Analyzer)", size: 4 },
  'E-82': { name: "JOEvolution", size: 3 },
  'E-83': { name: "JSS", size: 4 },
  'E-84': { name: "W/IRD", size: 2 },
  'E-85': { name: "쉬거라", size: 4 },
  'E-86': { name: "용쑤형", size: 4 },
  'E-87': { name: "지글 지글 식사팀", size: 4 },
  'E-88': { name: "추심단", size: 4 },
  'E-89': { name: "AI고 뭐고 일단 해", size: 4 },
  'E-90': { name: "GSG26", size: 3 },
  'E-91': { name: "Market Radar", size: 3 },
  'E-92': { name: "MAY THE MISO BE WITH YOU", size: 2 },
  'E-93': { name: "Zero Shot", size: 4 },
  'E-94': { name: "잘찾조", size: 2 },
  'E-95': { name: "서울의별", size: 3 },
  'E-96': { name: "에푸씨", size: 2 },
  'E-97': { name: "A-01", size: 4 },
  'E-98': { name: "A-02", size: 3 },
  'E-99': { name: "A-03", size: 3 },
  'E-100': { name: "A-04", size: 4 },
  'E-101': { name: "A-05", size: 3 },
  'E-102': { name: "A-06", size: 4 },
  'E-103': { name: "A-07", size: 4 },
  'E-104': { name: "A-08", size: 4 },

  'G-01': { name: "JDD", size: 3 },
  'G-02': { name: "KNOW:HOW", size: 1 },
  'G-03': { name: "TBD", size: 4 },
  'G-04': { name: "샘탁", size: 2 },
  'G-05': { name: "써브(Thermal Bridge)", size: 2 },
  'G-06': { name: "AX퍼펭단", size: 2 },
  'G-07': { name: "맥민희언즈", size: 4 },
  'G-08': { name: "화공이지만, 개발은 하고 싶어", size: 3 },
  'G-09': { name: "CATCH", size: 3 },
  'G-10': { name: "CorroVision", size: 3 },
  'G-11': { name: "CTRL+WHY", size: 3 },
  'G-12': { name: "Wave Maker", size: 1 },
  'G-13': { name: "2D2D", size: 3 },
  'G-14': { name: "캠핑왕 랄프", size: 3 },
  'G-15': { name: "AI구조대", size: 3 },
  'G-16': { name: "AutoGeo", size: 2 },
  'G-17': { name: "GS AIX", size: 2 },
  'G-18': { name: "NDA 검토 자동화", size: 1 },
  'G-19': { name: "RE:BUILDERS", size: 2 },
  'G-20': { name: "2038", size: 4 },
  'G-21': { name: "맥미닝(MakMeaning)", size: 3 },
  'G-22': { name: "뭐해보카", size: 4 },
  'G-23': { name: "비전트랙커", size: 2 },
  'G-24': { name: "일단커밋", size: 3 },
  'G-25': { name: "초경량", size: 2 },
  'G-26': { name: "하데스", size: 2 },
  'G-27': { name: "Josh", size: 1 },
  'G-28': { name: "Team Synergy", size: 4 },
  'G-29': { name: "SMP상한가", size: 2 },
  'G-30': { name: "에방", size: 2 },
  'G-31': { name: "D-01", size: 2 },
}

export const LEAGUE_BY_PREFIX = Object.fromEntries(LEAGUES.map((l) => [l.prefix, l]))
// 리그별 팀 번호 목록 (E-01, E-02, …)
export const TEAM_IDS_BY_LEAGUE = Object.fromEntries(
  LEAGUES.map((l) => [
    l.id,
    Array.from({ length: l.count }, (_, i) => l.prefix + '-' + String(i + 1).padStart(2, '0')),
  ]),
)
export const ALL_TEAM_IDS = LEAGUES.flatMap((l) => TEAM_IDS_BY_LEAGUE[l.id])
// 팀 번호에서 리그 찾기 ('E-45' → 필드리그)
export function leagueOf(teamId) {
  return LEAGUE_BY_PREFIX[String(teamId || '').charAt(0)] || null
}
// 그 팀의 인원 (모르면 null — 시트에 없는 번호)
export function teamSize(teamId) {
  return TEAMS[teamId]?.size ?? null
}


// ---------------------------------------------------------------
// 3. 마스터 메이트 개인별 담당 팀 번호  (TBD — 명단 확정 후 채우기)
//    참가자는 팀 번호만 입력합니다. "어느 마스터 메이트가 어느 팀을 담당하는지"를
//    개인 단위로 미리 정해둡니다. (코드 내부 식별자는 coach를 유지)
//    - name       : 마스터 메이트 이름. 명단이 아직 미확정이라 지금은 빈 값(TBD).
//                   확정되면 이름을 채우세요 (예: '김민준').
//    - teamNumbers: 그 마스터 메이트가 담당하는 팀 번호(숫자) 배열.
//                   예: teamNumbers: [1, 2, 3, 4, 5]
//    - callManager: true면 '호출 총관리자'로, 관리자 앱에서 전체 팀의 호출
//                   횟수를 볼 수 있습니다. 담당 팀이 있는 일반 메이트는 자기
//                   담당 팀만 보이므로, 전체를 봐야 하는 운영 총괄에게만
//                   true를 주세요 (비워두면 false).
//    - slackUserId : 슬랙 멤버 ID (예: 'U01ABCDEF'). 채우면 호출 발생 시
//                   그 사람만 슬랙에서 멘션되어 개인 알림을 받습니다.
//                   비어 있으면 멘션 없이 이름만 표기됩니다(채널 알림).
//                   ※ 슬랙 프로필 → 더보기 → '멤버 ID 복사'로 확인.
//    - 마스터 메이트는 관리자 앱 입장 시 이름을 직접 입력합니다. 여기 채워둔
//      이름과 정확히 같은 글자로 입력해야 담당 팀이 자동으로 연결됩니다.
//    - 인원 자체도 확정 전이라, 배열에 항목을 자유롭게 추가/삭제하면
//      됩니다 (지금은 자리 4개만 미리 만들어둔 상태).
// ---------------------------------------------------------------
export const COACH_ASSIGNMENTS = [
  // 호출 총관리자 — 담당 구간 없이 전체를 봅니다.
  //   callManager: true → 전체 팀 호출 횟수 + 미주문·미등록 재촉 권한
  { id: 'coach-1', name: '김세현', teamNumbers: [], slackUserId: 'U0BED7LG02D', callManager: true },
  { id: 'coach-2', name: '', teamNumbers: [], slackUserId: '', callManager: false },
  { id: 'coach-3', name: '', teamNumbers: [], slackUserId: '', callManager: false },
  { id: 'coach-4', name: '', teamNumbers: [], slackUserId: '', callManager: false },
]

// ---------------------------------------------------------------
// 4. 알레르기 선택지
//    ⚠️ 아래 MENUS에 실제로 들어간 성분만 선택지로 둡니다. 메뉴에 없는
//      성분을 늘어놓으면 대체 메뉴 준비와 무관한 응답이 쌓이기 때문입니다.
//      → 메뉴가 바뀌면 이 목록도 함께 갱신하세요.
//    ※ 알레르기 대응 메뉴를 미리 준비하는 게 아니라, 여기서 수집한
//      현황을 운영진이 확인해 대체 메뉴를 준비하는 방식입니다.
//    ※ 저장 형태: team.allergies = [[사람1의 알레르기...], [사람2의 알레르기...]]
//      (사람 단위로 배열을 나눠 저장 — 1명이 여러 개인지 여러 명이 각각
//      하나씩인지에 따라 대체 메뉴 준비 개수/조합이 달라지기 때문)
//    ※ 이 표기는 MENUS의 allergens와 정확히 일치해야 합니다. 그래야
//      "이 사람이 어떤 메뉴를 먹을 수 있는지"(아래 personDiet/teamDiet)와
//      관리자 화면의 대체식 집계가 동작합니다.
// ---------------------------------------------------------------
export const ALLERGY_OPTIONS = ['우유', '밀', '돼지고기', '쇠고기', '토마토']

// ---------------------------------------------------------------
// 5. 규모 · 운영 상수
// ---------------------------------------------------------------
export const TOTAL_TEAMS = ALL_TEAM_IDS.length // 현장 참가 팀 수 (필드 104 + 개발 31)
export const DELIVERY_TEAM_RANGE_SIZE = 25 // 관리자 배부 화면의 팀 번호 구간 크기
// 시트에 없는 번호로 등록할 때만 쓰이는 상한 (보통은 TEAMS[teamId].size가 상한)
export const MAX_MEMBER_COUNT = 10
export const PARTICIPANT_POLL_MS = 5000 // 참가자 화면 폴링 주기
export const ADMIN_POLL_MS = 3000 // 관리자 화면 폴링 주기 (호출 알림 포함)

// 참가자 화면 다크모드 시간대 (밤 20시 ~ 아침 7시 — 야식/새벽 눈부심 방지)
export const DARK_MODE_HOURS = { start: 20, end: 7 }

// ---------------------------------------------------------------
// 6. 메뉴  (확정 — 야식 피자 2종 / 아침 베이글 샌드위치 2종)
//    음료는 냉장고 자율 이용이라 메뉴에 없습니다. 전부 음식이며,
//    식사(끼니)마다 팀 인원수만큼만 담을 수 있습니다.
//    badges     : 메뉴 카드에 표시되는 식이 정보 뱃지 (예: '⚠️ 밀', '🌱 비건')
//    shortLabel : 관리자 배부 목록처럼 좁은 칸에서 쓰는 짧은 이름. 없으면 name.
//    name       : 메뉴 이름. 줄바꿈 문자(\n)를 넣으면 메뉴 카드에서 그 위치에서
//                 줄이 나뉩니다 (카드 이름에만 적용 — 장바구니·관리자 표기와
//                 CSV에서는 공백으로 눕혀 한 줄로 나옵니다).
//    image      : 음식 사진 경로. 파일은 participant-app/public/menu/ 에 두고
//                 './menu/파일명' 으로 씁니다 (배포 경로가 바뀌어도 동작하도록
//                 상대 경로 — vite.config의 base: './' 와 짝). 비면 🍽️ 표시.
//                 ※ 사진은 참가자 앱에만 필요하므로 admin-app에는 두지 않습니다
//                   (관리자 화면은 사진을 쓰지 않음 — 번들만 무거워짐).
//    allergyNote: 알레르기 상세 설명. **비워두면 allergens 로 자동 생성**됩니다
//                 (아래 파생 값 참고). 직접 문구를 쓰면 그 값이 그대로 쓰입니다.
//    allergens  : 이 메뉴에 포함된 알레르기 유발 성분 목록.
//                 ⚠️ 반드시 ALLERGY_OPTIONS와 똑같은 표기로 적으세요.
//                 (예: allergens: ['밀', '계란'])
//                 팀 등록 알레르기와 겹치는 인원을 관리자 화면에서 자동 집계합니다.
// ---------------------------------------------------------------
export const MENUS = {
  midnight: [
    {
      id: 'md-a',
      name: '페퍼로니 딜라이트 (1인)',
      shortLabel: '페퍼로니',
      badges: [],
      image: './menu/pepperoni-delight.png',
      allergyNote: '',
      allergens: ['우유', '밀', '돼지고기', '토마토'],
    },
    {
      id: 'md-b',
      name: '수퍼잭슨 (1인)',
      shortLabel: '수퍼잭슨',
      badges: [],
      image: './menu/super-jackson.png',
      // 성분이 5개라 카드 폭에서 줄이 어색하게 끊겨, 줄바꿈 위치를 직접 지정.
      // ⚠️ 자동 생성을 쓰지 않으므로 allergens를 고치면 이 문구도 함께 고칠 것.
      allergyNote: '⚠️ 우유·밀·돼지고기·쇠고기\n토마토 포함',
      allergens: ['우유', '밀', '돼지고기', '쇠고기', '토마토'],
    },
  ],
  breakfast: [
    {
      id: 'bf-a',
      name: '잠봉뵈르 샌드위치',
      shortLabel: '잠봉뵈르',
      badges: [],
      image: './menu/jambon-beurre.jpg',
      allergyNote: '',
      allergens: ['우유', '밀', '돼지고기'],
    },
    {
      id: 'bf-b',
      name: '햄&치즈 샌드위치',
      shortLabel: '햄&치즈',
      badges: [],
      image: './menu/ham-cheese.jpg',
      allergyNote: '',
      allergens: ['우유', '밀', '돼지고기', '토마토'],
    },
  ],
}

// ---------------------------------------------------------------
// (파생 값 — 수정하지 마세요)
// ---------------------------------------------------------------
export const ALL_MENUS = Object.values(MENUS).flat()

// 알레르기 표기 자동 생성 — allergyNote가 비어 있으면 allergens 로 문구를 만듭니다.
// 같은 정보를 두 곳에 손으로 적다 어긋나면 참가자에게 잘못된 알레르기 정보가
// 보이므로, 한쪽(allergens)만 관리하면 되게 했습니다.
ALL_MENUS.forEach((m) => {
  if (!m.allergyNote && m.allergens?.length) {
    m.allergyNote = `⚠️ ${m.allergens.join('·')} 포함`
  }
  // 1인분 표기가 군더더기인 곳(관리자 합산표)에서 쓰는 이름.
  // '페퍼로니 딜라이트 (1인)' → '페퍼로니 딜라이트'
  m.baseName = m.name.split('(')[0].trim() || m.name
})
export const MENU_BY_ID = Object.fromEntries(ALL_MENUS.map((m) => [m.id, m]))
export const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]))

// 팀 번호로 담당 마스터 메이트를 찾음 (teamNumbers가 비어있으면 null → 미배정)
// teamNumbers에는 'E-01' 같은 팀 번호가 들어갑니다.
// 리그가 다르면 같은 숫자라도 다른 팀이라 접두어까지 비교해야 합니다.
export function getAssignedCoachForTeam(teamId) {
  const id = String(teamId || '')
  if (!id) return null
  return COACH_ASSIGNMENTS.find((c) => c.teamNumbers.includes(id)) || null
}

// teamNumbers 배열을 "1~25번" / "1~10, 30~32번" 같은 범위 문자열로 압축
// (연속 구간은 a~b로 묶음, 비어있으면 null → "미배정" 표시용)
// 팀 번호를 리그별로 묶습니다 — 화면에서 격자·목록을 나눌 때 씁니다.
//   groupByLeague(['E-01','G-02']) → [{ league: 필드리그, ids: ['E-01'] }, ...]
export function groupByLeague(teamIds) {
  return LEAGUES.map((league) => ({
    league,
    ids: (teamIds || [])
      .filter((id) => String(id).charAt(0) === league.prefix)
      .sort((a, b) => parseInt(String(a).slice(2), 10) - parseInt(String(b).slice(2), 10)),
  })).filter((g) => g.ids.length > 0)
}

// 담당 팀 번호를 "E-01~E-25" 처럼 압축합니다.
// 리그가 섞이면 " · "로 나눠 씁니다 (E-01~E-20 · G-01~G-05).
export function formatTeamRange(teamIds) {
  const groups = groupByLeague(teamIds)
  if (!groups.length) return null
  const 조각 = groups.map(({ league, ids }) => {
    const nums = ids.map((id) => parseInt(String(id).slice(2), 10))
    const parts = []
    let start = nums[0]
    let prev = nums[0]
    const 표기 = (n) => league.prefix + '-' + String(n).padStart(2, '0')
    for (let i = 1; i <= nums.length; i++) {
      if (i < nums.length && nums[i] === prev + 1) {
        prev = nums[i]
        continue
      }
      parts.push(start === prev ? 표기(start) : 표기(start) + '~' + 표기(prev))
      if (i < nums.length) {
        start = nums[i]
        prev = nums[i]
      }
    }
    return parts.join(', ')
  })
  return 조각.join(' · ')
}

// ---------------------------------------------------------------
// 알레르기 → 식사 가능 여부 판정  (수집한 알레르기를 "해석"하는 부분)
//
//   같은 끼니의 메뉴들이 성분을 거의 공유하기 때문에, 알레르기 한 항목만
//   달라도 결과가 크게 갈립니다. 예를 들어 현재 메뉴 구성에서는
//     - 우유·밀·돼지고기 중 하나라도 있으면 → 4개 메뉴 전부 불가(두 끼 대체식)
//     - 쇠고기만 있으면              → 야식은 페퍼로니만, 아침은 제한 없음
//     - 토마토만 있으면              → 야식은 불가, 아침은 잠봉뵈르만
//   이 판정을 화면마다 따로 계산하면 서로 어긋나므로 여기 한 곳에 둡니다.
//
//   ※ 메뉴/알레르기 구성이 바뀌면 이 함수는 그대로 두고 MENUS만 고치면 됩니다
//     (판정은 allergens 값에서 파생되므로 하드코딩된 규칙이 없습니다).
// ---------------------------------------------------------------

// 특정 알레르기 목록을 가진 1명이 해당 메뉴를 먹을 수 있는지
export function canEatMenu(menu, allergies) {
  const mine = allergies || []
  return !(menu.allergens || []).some((a) => mine.includes(a))
}

// 1명 기준 판정 → { byMeal: { [mealId]: 먹을 수 있는 메뉴[] }, needsAlt: [mealId...] }
export function personDiet(allergies) {
  const byMeal = {}
  const needsAlt = []
  MEALS.forEach((meal) => {
    const eatable = (MENUS[meal.id] || []).filter((m) => canEatMenu(m, allergies))
    byMeal[meal.id] = eatable
    if (eatable.length === 0) needsAlt.push(meal.id)
  })
  return { byMeal, needsAlt }
}

// 팀 전체 판정. team.allergies = [[1인의 알레르기...], [2인의 알레르기...]]
//   - eatableByMenu : 메뉴별로 "먹을 수 있는 팀원 수" (주문 담기 상한 계산용)
//   - eatableByMeal : 끼니별로 "한 가지라도 먹을 수 있는 팀원 수"
//   - altByMeal     : 끼니별로 "대체식이 필요한 인원 수"
//   - altPeople     : 대체식 대상 인원의 알레르기 목록 (케이터링 준비 내역용)
export function teamDiet(memberCount, allergies) {
  const people = (allergies || []).map((p) => (Array.isArray(p) ? p : [p]))
  // 알레르기를 입력하지 않은 나머지 인원은 제약이 없는 사람으로 계산
  const plain = Math.max(0, (memberCount || 0) - people.length)

  const eatableByMenu = {}
  const eatableByMeal = {}
  const altByMeal = {}
  const altPeople = {}

  MEALS.forEach((meal) => {
    ;(MENUS[meal.id] || []).forEach((menu) => {
      eatableByMenu[menu.id] = plain + people.filter((p) => canEatMenu(menu, p)).length
    })
    const okPeople = people.filter((p) => (MENUS[meal.id] || []).some((m) => canEatMenu(m, p)))
    eatableByMeal[meal.id] = plain + okPeople.length
    const alt = people.filter((p) => !(MENUS[meal.id] || []).some((m) => canEatMenu(m, p)))
    altByMeal[meal.id] = alt.length
    altPeople[meal.id] = alt
  })

  return { eatableByMenu, eatableByMeal, altByMeal, altPeople }
}
