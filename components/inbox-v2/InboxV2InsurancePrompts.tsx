'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, FileText, Calendar, CheckCircle2 } from 'lucide-react'

type Props = {
  suggestions: Array<{ action: string; template: string }>
  onAction: (action: string) => Promise<void>
}

export function InboxV2InsurancePrompts({ suggestions, onAction }: Props) {
  return (
    <Card className="p-4 bg-green-50 border-green-200">
      <div className="flex items-start gap-2 mb-3">
        <Shield className="w-5 h-5 text-green-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">Insurance Claim Detected</h3>
          <p className="text-xs text-gray-600 mb-2">
            Want to move this to Insurance Opportunity pipeline?
          </p>
          <Button
            size="sm"
            variant="default"
            className="w-full mb-3"
            onClick={() => onAction('insurance')}
          >
            Move to Insurance Pipeline
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            // Send adjuster prep reply
            console.log('Send adjuster prep reply')
          }}
        >
          <FileText className="w-4 h-4 mr-2" />
          Adjuster Prep Reply
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            // Send insurance help message
            console.log('Send insurance help message')
          }}
        >
          <Shield className="w-4 h-4 mr-2" />
          Insurance Help Message
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            // Send claim checklist
            console.log('Send claim checklist')
          }}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Claim Checklist
        </Button>
        <Button
          size="sm"
          variant="default"
          className="w-full"
          onClick={() => {
            // Schedule inspection (URGENT)
            console.log('Schedule inspection (URGENT)')
          }}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Schedule Inspection (URGENT)
        </Button>
      </div>
    </Card>
  )
}





















































