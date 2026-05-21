'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/send', label: 'Send Today' },
  { href: '/discover', label: 'Find Prospects' },
  { href: '/prospects', label: 'Prospects' },
  { href: '/templates', label: 'Templates' },
  { href: '/reports', label: 'Reports' },
]

export default function Nav() {
  const path = usePathname()
  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 h-14">
        <span className="font-semibold text-gray-900 mr-4 text-sm">Wex Advisory Outreach</span>
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              path === l.href
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
