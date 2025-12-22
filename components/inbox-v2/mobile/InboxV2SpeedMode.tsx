'use client'

import { ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Zap, ZapOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InboxV2SpeedModeProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: ReactNode
}

/**
 * Speed Mode - Minimal UI for busy roofers
 * Hides non-essential elements and focuses on core actions
 */
export function InboxV2SpeedMode({
  enabled,
  onToggle,
  children,
}: InboxV2SpeedModeProps) {
  return (
    <>
      {/* Speed Mode Toggle */}
      <div className="fixed top-20 right-4 z-50 md:hidden">
        <Button
          variant={enabled ? 'default' : 'outline'}
          size="sm"
          onClick={() => onToggle(!enabled)}
          className={cn(
            'shadow-lg',
            enabled && 'bg-yellow-500 hover:bg-yellow-600'
          )}
        >
          {enabled ? (
            <>
              <ZapOff className="w-4 h-4 mr-1" />
              Exit Speed Mode
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-1" />
              Speed Mode
            </>
          )}
        </Button>
      </div>

      {/* Speed Mode Overlay */}
      {enabled && (
        <div className="fixed inset-0 bg-yellow-50/50 z-40 pointer-events-none" />
      )}

      {/* Content with Speed Mode Styling */}
      <div
        className={cn(
          'transition-all duration-300',
          enabled && 'speed-mode-active'
        )}
      >
        {children}
      </div>

      <style jsx>{`
        .speed-mode-active :global(.inbox-non-essential) {
          display: none !important;
        }

        .speed-mode-active :global(.inbox-filters),
        .speed-mode-active :global(.inbox-metrics),
        .speed-mode-active :global(.inbox-ai-panel) {
          display: none !important;
        }
      `}</style>
    </>
  )
}



















































