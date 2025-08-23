import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import PastDueServerBanner from '@/components/billing/PastDueServerBanner'
import { ToastProvider } from '@/components/toast/ToastProvider'

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
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
