// =====================================================================
//  로컬 연동 테스트용 정적 서버 (의존성 없음)
//
//  두 앱은 완전히 독립된 프로젝트지만, 로컬에서 "공유 저장소" 연동을
//  확인하려면 같은 origin에서 서빙해야 localStorage 폴백이 공유됩니다.
//    /participant → participant-app/dist
//    /admin       → admin-app/dist
//
//  사용법:  node preview-server.js   (기본 포트 4173)
// =====================================================================
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 4173
const ROOTS = {
  '/participant': path.join(__dirname, 'participant-app', 'dist'),
  '/admin': path.join(__dirname, 'admin-app', 'dist'),
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    let pathname = decodeURIComponent(url.pathname)

    if (pathname === '/' || pathname === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        '<meta charset="utf-8"><h2>해커톤 주문 서비스 (로컬 미리보기)</h2>' +
          '<p><a href="/participant/?table=05">참가자 페이지 (테이블 05)</a></p>' +
          '<p><a href="/admin/">관리자 페이지</a></p>',
      )
      return
    }

    const prefix = Object.keys(ROOTS).find((p) => pathname === p || pathname.startsWith(p + '/'))
    if (!prefix) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    let rel = pathname.slice(prefix.length).replace(/^\//, '') || 'index.html'
    let file = path.join(ROOTS[prefix], rel)
    if (!file.startsWith(ROOTS[prefix])) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOTS[prefix], 'index.html') // SPA 폴백
    }
    try {
      const data = fs.readFileSync(file)
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  .listen(PORT, () => {
    console.log(`preview server running: http://localhost:${PORT}`)
    console.log(`  참가자: http://localhost:${PORT}/participant/?table=05`)
    console.log(`  관리자: http://localhost:${PORT}/admin/`)
  })
