import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Fix mobile keyboard pushing content behind fixed elements
// Scrolls focused input into view when virtual keyboard opens
if ('visualViewport' in window && window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const focused = document.activeElement as HTMLElement
    if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT')) {
      setTimeout(() => {
        focused.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
