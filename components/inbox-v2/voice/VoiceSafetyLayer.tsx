// Block 20000 — Voice Safety Layer
// Confirmation prompts for high-impact actions

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

export interface SafetyConfirmation {
  id: string
  action: string
  message: string
  severity: 'high' | 'medium' | 'low'
  onConfirm: () => void
  onCancel: () => void
}

interface VoiceSafetyLayerProps {
  confirmation: SafetyConfirmation | null
  onResolve: () => void
}

export function VoiceSafetyLayer({
  confirmation,
  onResolve,
}: VoiceSafetyLayerProps) {
  const [spoken, setSpoken] = useState(false)

  useEffect(() => {
    if (confirmation && !spoken) {
      speakConfirmation(confirmation.message)
      setSpoken(true)
    }
  }, [confirmation, spoken])

  const speakConfirmation = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 1.0
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleConfirm = () => {
    if (confirmation) {
      confirmation.onConfirm()
      onResolve()
      setSpoken(false)
    }
  }

  const handleCancel = () => {
    if (confirmation) {
      confirmation.onCancel()
      onResolve()
      setSpoken(false)
    }
  }

  if (!confirmation) return null

  const severityColors = {
    high: 'bg-red-50 border-red-200',
    medium: 'bg-yellow-50 border-yellow-200',
    low: 'bg-blue-50 border-blue-200',
  }

  const severityIcons = {
    high: <AlertTriangle className="w-6 h-6 text-red-600" />,
    medium: <AlertTriangle className="w-6 h-6 text-yellow-600" />,
    low: <AlertTriangle className="w-6 h-6 text-blue-600" />,
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div
        className={`bg-white rounded-lg border-2 p-6 max-w-md w-full ${severityColors[confirmation.severity]}`}
      >
        <div className="flex items-start gap-4 mb-4">
          {severityIcons[confirmation.severity]}
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-2">Confirm Action</h3>
            <p className="text-gray-700">{confirmation.message}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            variant={confirmation.severity === 'high' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            className="flex-1"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Confirm
          </Button>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          Say "Confirm" or "Cancel" to respond
        </div>
      </div>
    </div>
  )
}

// Helper function to create safety confirmations
export function createSafetyConfirmation(
  action: string,
  details: {
    message: string
    severity?: 'high' | 'medium' | 'low'
    onConfirm: () => void
    onCancel?: () => void
  }
): SafetyConfirmation {
  return {
    id: `confirmation-${Date.now()}`,
    action,
    message: details.message,
    severity: details.severity || 'medium',
    onConfirm: details.onConfirm,
    onCancel: details.onCancel || (() => {}),
  }
}

// High-impact actions that require confirmation
export const HIGH_IMPACT_ACTIONS = [
  'send',
  'mark_as_closed',
  'delete_thread',
  'suppress_thread',
  'update_status',
  'book_appointment',
  'create_followup',
]



















































