import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Scrolls the window to the top on every route change.
 *
 * Mount once inside <BrowserRouter> (before <Routes>) so the effect fires
 * regardless of which route renders. Fixes the "Food tab opens mid-scroll"
 * bug caused by native body scroll position persisting across React Router
 * navigations when AppShell <main> only has overflow-x-hidden.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
