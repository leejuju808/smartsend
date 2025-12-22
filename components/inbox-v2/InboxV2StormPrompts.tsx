'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CloudRain, AlertTriangle, Calendar, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Props = {
  suggestions: Array<{ action: string; template: string; urgency: string }>
  urgencyScore: string
  onAction: (action: string) => Promise<void>
}

export function InboxV2StormPrompts({ suggestions, urgencyScore, onAction }: Props) {
  const isUrgent = urgencyScore === 'critical' || urgencyScore === 'high'

  return (
    <Card className={`p-4 ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
      <div className="flex items-start gap-2 mb-3">
        <CloudRain className={`w-5 h-5 ${isUrgent ? 'text-red-600' : 'text-blue-600'} mt-0.5`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm">Storm damage detected</h3>
            {isUrgent && (
              <Badge variant="destructive" className="text-[10px]">
                URGENT
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-600 mb-2">
            Move to HOT + create urgent task?
          </p>
          <Button
            size="sm"
            variant={isUrgent ? 'destructive' : 'default'}
            className="w-full mb-3"
            onClick={() => onAction('hot')}
          >
            Move to HOT + Create Task
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            // Send emergency message
            console.log('Send emergency message')
          }}
        >
          <AlertTriangle className="w-4 h-4 mr-2" />
          Emergency Message
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            // Offer urgent booking times
            console.log('Offer urgent booking times')
          }}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Urgent Booking Times
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            // Send storm template
            console.log('Send storm template')
          }}
        >
          <CloudRain className="w-4 h-4 mr-2" />
          Storm Template
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start bg-white"
          onClick={() => {
            // Send repair sequence
            console.log('Send repair sequence')
          }}
        >
          <Wrench className="w-4 h-4 mr-2" />
          Repair Sequence
        </Button>
      </div>
    </Card>
  )
}





















































