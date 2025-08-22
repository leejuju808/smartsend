import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import PastDueServerBanner from '@/components/billing/PastDueServerBanner'
import { ToastProvider } from '@/components/toast/ToastProvider'
import QuotaBadge from '@/components/header/QuotaBadge'
import UsageDropdown from '@/components/header/UsageDropdown'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SmartSend - AI-Powered Cold Email Generator',
  description: 'Generate compelling cold emails with AI. Boost your outreach with personalized, professional email templates.',
  keywords: 'cold email, email generator, AI, outreach, sales, marketing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ToastProvider>
          {/* @ts-expect-error Server Component */}
          <PastDueServerBanner />
          <header className="border-b bg-white">
            <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
              <a href="/" className="text-sm font-semibold">SmartSend</a>
              <div className="flex items-center gap-2">
                {/* @ts-expect-error Client component */}
                <QuotaBadge />
                {/* @ts-expect-error Client component */}
                <UsageDropdown />
              </div>
            </div>
          </header>
          <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  )
}
