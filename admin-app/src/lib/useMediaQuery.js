import { useEffect, useState } from 'react'

// 화면 폭에 따라 '어디에 그릴지'가 달라져야 할 때 씁니다.
// 보이고 숨기는 정도는 CSS로 충분하지만, 요소를 다른 부모 밑으로 옮기는 건
// CSS로 안 됩니다(호출 카드의 '완료 처리' 버튼이 그런 경우).
//
// 서버 렌더링이 없고 addEventListener('change')는 사파리 14부터 지원해,
// 구형 사파리를 위한 addListener 대비는 두지 않았습니다.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    // 구독 사이에 값이 바뀌었을 수 있어 한 번 맞춰줍니다
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
