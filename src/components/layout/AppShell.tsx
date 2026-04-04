import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { BottomNav } from './BottomNav'

export function AppShell() {
  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      <Header />
      <main className="flex-1 pb-safe">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
