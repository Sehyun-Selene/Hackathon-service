// 신규 호출 알림음 (외부 에셋 없이 WebAudio로 생성)
// 브라우저 정책상 사용자 제스처 이후에만 소리를 낼 수 있으므로
// 이름 입력(입장) 버튼 클릭 시 initAudio()를 호출해 둔다.
let ctx = null

export function initAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    /* 미지원 브라우저 무시 */
  }
}

export function playCallAlert() {
  if (!ctx) return
  try {
    const t0 = ctx.currentTime
    ;[0, 0.25].forEach((delay, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = i === 0 ? 880 : 1175
      gain.gain.setValueAtTime(0.25, t0 + delay)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.22)
      osc.start(t0 + delay)
      osc.stop(t0 + delay + 0.25)
    })
  } catch {
    /* ignore */
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200])
}
