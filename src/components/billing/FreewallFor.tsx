'use client'
import React from 'react'
import Freewall from '@/components/billing/Freewall'

/** Convenience wrapper: <FreewallFor kind="gen_firstline">…</FreewallFor> */
export default function FreewallFor({ kind, children, className }: { kind: string; children: React.ReactNode; className?: string }) {
  return (
    // @ts-expect-error Server/Client boundary OK here
    <Freewall kind={kind} className={className}>{children}</Freewall>
  )
}
