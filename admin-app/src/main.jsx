import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// 디자인 토큰이 먼저 와야 styles.css 가 var(--po-*) 를 읽을 수 있습니다
import './plai-order-tokens.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
