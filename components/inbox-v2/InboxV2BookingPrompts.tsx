'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, Link as LinkIcon } from 'lucide-react'

type Props = {
  suggestions: Array<{ time: string; date: string; type: string }>
  contactId?: string | null
  onBook: (time: string, date: string) => Promise<void>
}

export function InboxV2BookingPrompts({ suggestions, contactId, onBook }: Props) {
  const handleOfferTime = async (time: string, date: string) => {
    await onBook(time, date)
  }

  const handleSendBookingLink = async () => {
    // Generate and send booking link
    console.log('Send booking link')
  }

  return (
    <Card className="p-4 bg-yellow-50 border-yellow-200">
      <div className="flex items-start gap-2 mb-3">
        <Calendar className="w-5 h-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">They&apos;re ready to book — suggest a time?</h3>
          <p className="text-xs text-gray-600">
            Homeowner shows booking intent. Offer inspection times to lock in the appointment.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {/* Suggested Times */}
        {suggestions.length > 0 ? (
          suggestions.slice(0, 2).map((suggestion, i) => (
            <Button
              key={i}
              size="sm"
              variant="outline"
              className="w-full justify-start bg-white"
              onClick={() => handleOfferTime(suggestion.time, suggestion.date)}
            >
              <Clock className="w-4 h-4 mr-2" />
              Offer {suggestion.time} on {new Date(suggestion.date).toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              })}
            </Button>
          ))
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start bg-white"
              onClick={() => {
                const tomorrow = new Date()
                tomorrow.setDate(tomorrow.getDate() + 1)
                handleOfferTime('2:00 PM', tomorrow.toISOString().split('T')[0])
              }}
            >
              <Clock className="w-4 h-4 mr-2" />
              Offer 2:00 PM today
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start bg-white"
              onClick={() => {
                const tomorrow = new Date()
                tomorrow.setDate(tomorrow.getDate() + 1)
                handleOfferTime('10:30 AM', tomorrow.toISOString().split('T')[0])
              }}
            >
              <Clock className="w-4 h-4 mr-2" />
              Offer 10:30 AM tomorrow
            </Button>
          </>
        )}

        <Button
          size="sm"
          variant="default"
          className="w-full"
          onClick={handleSendBookingLink}
        >
          <LinkIcon className="w-4 h-4 mr-2" />
          Send Booking Link
        </Button>
      </div>
    </Card>
  )
}





















































