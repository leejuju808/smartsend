// Block 20000 — Quick-Action Voice Templates
// Pre-set templates that can be activated by voice

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic } from 'lucide-react'

export const VOICE_TEMPLATES = [
  {
    id: 'in_area_today',
    text: "We're in your area today. Would you like us to stop by?",
    keywords: ['in area', 'area today', 'stop by'],
  },
  {
    id: 'insurance_help',
    text: 'We can help you with your insurance claim. Would you like to schedule a free inspection?',
    keywords: ['insurance', 'insurance help', 'insurance claim'],
  },
  {
    id: 'tomorrow_morning',
    text: 'We can come out tomorrow morning. What time works best for you?',
    keywords: ['tomorrow', 'tomorrow morning', 'come tomorrow'],
  },
  {
    id: 'photo_request',
    text: 'Could you send us photos of the damage? That will help us give you an accurate estimate.',
    keywords: ['photos', 'send photos', 'photo request', 'pictures'],
  },
  {
    id: 'estimate_scheduled',
    text: 'Great! We have you scheduled for an estimate. We will send you a confirmation shortly.',
    keywords: ['estimate scheduled', 'scheduled', 'confirmation'],
  },
  {
    id: 'follow_up',
    text: 'Just following up on your roof inquiry. Are you still interested in getting an estimate?',
    keywords: ['follow up', 'following up', 'still interested'],
  },
]

interface VoiceTemplatesProps {
  onSelect: (text: string) => void
  onVoiceActivate?: (templateId: string) => void
}

export function VoiceTemplates({ onSelect, onVoiceActivate }: VoiceTemplatesProps) {
  const [listeningForTemplate, setListeningForTemplate] = useState(false)

  const handleVoiceActivation = () => {
    setListeningForTemplate(true)
    // This would integrate with voice commands to listen for template keywords
    // For now, just show UI feedback
    setTimeout(() => {
      setListeningForTemplate(false)
    }, 5000)
  }

  return (
    <div className="flex flex-wrap gap-2 p-2">
      {VOICE_TEMPLATES.map((template) => (
        <Button
          key={template.id}
          variant="outline"
          size="sm"
          onClick={() => onSelect(template.text)}
          className="text-xs"
        >
          {template.text.substring(0, 30)}...
        </Button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleVoiceActivation}
        className="text-xs"
        disabled={listeningForTemplate}
      >
        <Mic className="w-3 h-3 mr-1" />
        {listeningForTemplate ? 'Listening...' : 'Voice'}
      </Button>
    </div>
  )
}



















































