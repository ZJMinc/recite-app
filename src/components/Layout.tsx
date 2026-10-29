import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '今日', icon: 'today' },
  { to: '/review', label: '背诵', icon: 'review' },
  { to: '/browse', label: '知识', icon: 'browse' },
  { to: '/stats', label: '统计', icon: 'stats' },
  { to: '/settings', label: '设置', icon: 'settings' },
]

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto max-w-[600px] border-t border-line/80 bg-surface/92 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl">
        <ul className="flex items-stretch">
          {NAV.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] transition-colors',
                    isActive ? 'text-accent' : 'text-muted hover:text-ink-soft',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                        isActive ? 'bg-accent-soft' : '',
                      ].join(' ')}
                    >
                      <Icon name={item.icon} size={21} />
                    </span>
                    <span className={isActive ? 'font-medium' : ''}>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const focusMode = pathname.startsWith('/review')

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[600px] flex-col">
      <main
        className={
          focusMode
            ? 'flex min-h-dvh flex-1 flex-col'
            : 'flex-1 px-4 pb-28 pt-5 sm:px-5'
        }
      >
        <Outlet />
      </main>
      {!focusMode && <BottomNav />}
    </div>
  )
}
