import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import PastDueServerBanner from '@/components/billing/PastDueServerBanner'
import { ToastProvider } from '@/components/ui/toast/ToastProvider'
import { CommandPaletteProvider } from '@/components/CommandPaletteProvider'
import Providers from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: "SmartSend AI ⚡ | Cold Email Automation OS",
  description:
    "Automate your cold outreach — import leads, send sequences, track replies, and manage it all in one AI-powered inbox.",
  keywords: "cold email, email automation, AI outreach, sales automation, email sequences, lead management, reply tracking",
  openGraph: {
    title: "SmartSend AI ⚡",
    description:
      "The Cold Email Operating System for SMBs — automate, track, and reply with AI precision.",
    url: "https://smartsendhq.com",
    siteName: "SmartSend AI",
    images: [
      {
        url: "https://smartsendhq.com/og-banner.png",
        width: 1200,
        height: 630,
        alt: "SmartSend AI Dashboard",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartSend AI ⚡",
    description:
      "The AI-powered Cold Email OS for SMBs — automate, send, and reply smarter.",
    images: ["https://smartsendhq.com/og-banner.png"],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID || 'G-XXXXXXX'
  
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Google Analytics */}
        {gaId !== 'G-XXXXXXX' && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}
        {/* Plausible Analytics (alternative - uncomment if preferred) */}
        {/* <Script defer data-domain="smartsendhq.com" src="https://plausible.io/js/script.js" /> */}
        <Providers>
          <CommandPaletteProvider>
            <ToastProvider>
              <PastDueServerBanner />
              {children}
            </ToastProvider>
          </CommandPaletteProvider>
        </Providers>
      </body>
    </html>
  )
}
