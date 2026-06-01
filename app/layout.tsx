import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})

export const metadata: Metadata = {
  title: 'Wex Advisory — Outreach',
  description: 'Internal cold email outreach tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} antialiased`}
        style={{ display: 'flex', height: '100vh', overflow: 'hidden', margin: 0 }}
      >
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
