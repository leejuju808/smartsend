'use client'

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClientComponentClient } from '@/lib/supabase'
import { isCoachingUIEnabled } from '@/lib/feature-flags'

export interface TourStep {
  id: string
  title: string
  description: string
  target?: string // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

interface TourOverlayProps {
  steps: TourStep[]
  onComplete?: () => void
  onSkip?: () => void
  workspaceId?: string
}

export function TourOverlay({ steps, onComplete, onSkip, workspaceId }: TourOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [visible, setVisible] = useState(true)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const supabase = createClientComponentClient()

  // BLOCK 272500 — Internalization Sprint: coaching UI is OFF by default.
  if (!isCoachingUIEnabled()) return null

  useEffect(() => {
    if (steps.length === 0 || currentStep >= steps.length) {
      return
    }

    const step = steps[currentStep]
    if (step.target) {
      const element = document.querySelector(step.target) as HTMLElement
      setTargetElement(element)
      
      if (element) {
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else {
      setTargetElement(null)
    }
  }, [currentStep, steps])

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      await handleComplete()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = async () => {
    setVisible(false)
    
    // Mark tour as completed
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && workspaceId) {
        await supabase.rpc('mark_onboarding_step_done', {
          p_user_id: user.id,
          p_workspace_id: workspaceId,
          p_step_id: 'complete_tour'
        })
      }
    } catch (error) {
      console.error('Error marking tour complete:', error)
    }

    onComplete?.()
  }

  const handleSkip = () => {
    setVisible(false)
    onSkip?.()
  }

  if (!visible || steps.length === 0 || currentStep >= steps.length) {
    return null
  }

  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  // Calculate position for tooltip
  const getTooltipPosition = () => {
    if (!targetElement) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }

    const rect = targetElement.getBoundingClientRect()
    const position = step.position || 'bottom'

    switch (position) {
      case 'top':
        return {
          top: `${rect.top - 20}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translate(-50%, -100%)',
        }
      case 'bottom':
        return {
          top: `${rect.bottom + 20}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translate(-50%, 0)',
        }
      case 'left':
        return {
          top: `${rect.top + rect.height / 2}px`,
          left: `${rect.left - 20}px`,
          transform: 'translate(-100%, -50%)',
        }
      case 'right':
        return {
          top: `${rect.top + rect.height / 2}px`,
          left: `${rect.right + 20}px`,
          transform: 'translate(0, -50%)',
        }
      default:
        return {
          top: `${rect.top + rect.height / 2}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translate(-50%, -50%)',
        }
    }
  }

  return (
    <>
      {/* Dimmed background overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-[9998] transition-opacity"
        onClick={handleSkip}
      />

      {/* Spotlight/highlight */}
      {targetElement && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: `${targetElement.getBoundingClientRect().top - 8}px`,
            left: `${targetElement.getBoundingClientRect().left - 8}px`,
            width: `${targetElement.getBoundingClientRect().width + 16}px`,
            height: `${targetElement.getBoundingClientRect().height + 16}px`,
            borderRadius: '8px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 0 4px rgba(59, 130, 246, 0.8)',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[10000] bg-card border rounded-xl shadow-2xl p-6 max-w-sm pointer-events-auto"
        style={getTooltipPosition()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>
          <button
            onClick={handleSkip}
            className="ml-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {currentStep + 1} of {steps.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={isFirst}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleNext}
            >
              {isLast ? 'Complete' : 'Next'}
              {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}









