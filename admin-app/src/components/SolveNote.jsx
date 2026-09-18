// 완료 처리할 때 남기는 메모.
//
// 호출 사유는 참가자가 "무엇이 막혔는지"를 적은 것이고, 이건 메이트가
// "무엇을 어떻게 풀었는지"를 적는 자리입니다. 둘이 한 줄에 나란히 쌓여야
// 회고에서 쓸 수 있습니다 — 사유만 남으면 문제 목록일 뿐입니다.
//
// 비워 두고 완료해도 됩니다. 현장에서 손이 바쁠 때 적으라고 막아 세우면
// 완료 처리 자체가 밀리고, 그러면 미처리 재촉이 엉뚱하게 울립니다.
//
// 처음에는 접어 두고 '적으려면 누르세요' 버튼만 뒀었는데, 점선 테두리가
// 안내 문구처럼 보여 누를 수 있다는 걸 알아채지 못했습니다. 접는 것을
// 없애고 칸을 늘 펴 둡니다 — 두 줄이라 완료 버튼이 크게 밀리지 않습니다.
//
// 글자는 부모가 들고 있습니다(value/onChange). 다른 호출을 고르면 부모가
// 비우므로, 앞 호출에 적던 글이 따라오지 않습니다.
export default function SolveNote({ value, onChange, id }) {
  return (
    <div className="solve-note">
      <label className="solve-note-label" htmlFor={id}>
        ✍️ 미소가 막혔던 순간이 있었다면 작성해주세요!
      </label>
      <p className="solve-note-help">어떤 문제였고 어떻게 도와주셨는지 적어주세요.</p>
      <textarea
        id={id}
        className="solve-note-input"
        rows={2}
        value={value}
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
        placeholder="예) 배포가 계속 실패했는데, 환경변수 하나가 빠져 있어 채워드렸어요."
      />
    </div>
  )
}
