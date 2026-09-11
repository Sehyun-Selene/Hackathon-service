# G-Order 랜턴 로고

앱 안의 랜턴(`LanternIcon`, active 상태)을 그대로 뽑은 파일입니다.
색은 앱의 `--po-state-active` = **#F08B2C**, 배경은 투명(알파 0)입니다.
등갓 안쪽 면만 같은 색 22% 반투명이라, 어두운 배경에 얹어도 그 부분이
흰 사각형으로 뜨지 않습니다.

| 파일 | 용도 |
|---|---|
| `g-order-lantern.svg` | 원본(벡터). 크기 제한 없이 쓰려면 이걸 쓰세요 |
| `g-order-lantern-1024.png` | 인쇄물·큰 화면 |
| `g-order-lantern-512.png` | 슬라이드·문서 |
| `g-order-lantern-256.png` | 채널 아이콘·작은 자리 |

다른 크기가 필요하면 (예: 2048)

    chrome --headless=new --disable-gpu --hide-scrollbars \
      --default-background-color=00000000 --window-size=2048,2048 \
      --screenshot=g-order-lantern-2048.png render-lantern.html

색을 바꾸려면 `render-lantern.html` 안의 `#F08B2C` 를 바꾼 뒤 다시 뽑으면 됩니다.
