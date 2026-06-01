'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { icon: '📊', label: 'Analytics', href: '/' },
  { icon: '🔍', label: 'Discover', href: '/discover' },
  { icon: '👥', label: 'Pipeline', href: '/prospects' },
  { icon: '📨', label: 'Send', href: '/send' },
  { icon: '📝', label: 'Templates', href: '/templates' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      style={{
        width: '200px',
        background: '#1e293b',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        padding: '20px 12px',
        gap: '4px',
        height: '100vh',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '1.5px',
          color: '#475569',
          textTransform: 'uppercase',
          marginBottom: '16px',
          padding: '0 8px',
        }}
      >
        Wex Outreach
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              color: isActive ? '#ffffff' : '#94a3b8',
              background: isActive ? '#1d4ed8' : 'transparent',
              fontWeight: isActive ? 500 : 400,
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' }}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        )
      })}
    </aside>
  )
}
