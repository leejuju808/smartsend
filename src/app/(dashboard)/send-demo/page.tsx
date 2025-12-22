'use client'
import { useState } from 'react'

export default function SendDemo() {
  const [log, setLog] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)

  // TODO: Wire to actual session
  const profile_id = 'USER_PROFILE_ID'
  const sender_id = 'SENDER_ID'

  const runSend = async () => {
    setIsRunning(true)
    setLog('Guarding…')
    
    try {
      const guardRes = await fetch('/api/send/guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id,
          sender_id,
          recipients: [
            { email: 'ok1@example.com' },
            { email: 'ok2@example.com' },
            { email: 'blocked@example.com' } // suppose in suppression/bounces
          ]
        })
      })
      
      if (!guardRes.ok) {
        const errorData = await guardRes.json()
        setLog(prev => prev + `\n❌ Guard failed: ${errorData.error}`)
        setIsRunning(false)
        return
      }
      
      const guard = await guardRes.json()
      setLog(prev => prev + `\n✅ Allowed: ${guard.allowed?.length}, ❌ Blocked: ${guard.blocked?.length}`)
      
      if (guard.limits) {
        setLog(prev => prev + `\n📊 Limits: ${guard.limits.hour_used}/${guard.limits.hourly_limit} hourly, ${guard.limits.day_used}/${guard.limits.warmed_daily_cap} daily`)
      }

      if (guard.allowed?.length) {
        setLog(prev => prev + `\nEnqueuing ${guard.allowed.length}…`)
        const enqRes = await fetch('/api/send/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id,
            sender_id,
            messages: guard.allowed.map((r: any) => ({
              to_email: r.email,
              subject: 'Hi',
              body: 'Quick question about booking a time…'
            }))
          })
        })
        
        if (!enqRes.ok) {
          const errorData = await enqRes.json()
          setLog(prev => prev + `\n❌ Enqueue failed: ${errorData.error}`)
        } else {
          const enq = await enqRes.json()
          setLog(prev => prev + `\n✅ Queued: ${enq.queued}`)
        }
      } else {
        setLog(prev => prev + `\n⚠️ No messages to enqueue`)
      }
    } catch (error) {
      setLog(prev => prev + `\n❌ Error: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-xl font-semibold">Send Demo (Guard → Enqueue)</h1>
      <p className="text-sm text-gray-600">
        This demo shows the send guard and enqueue flow. Update <code className="bg-gray-100 px-1 rounded">profile_id</code> and <code className="bg-gray-100 px-1 rounded">sender_id</code> in the code to test with your data.
      </p>
      <button 
        onClick={runSend} 
        disabled={isRunning}
        className="px-4 py-2 rounded-2xl shadow bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRunning ? 'Running...' : 'Run Send Flow'}
      </button>
      <pre className="p-4 bg-gray-900 text-green-300 rounded-2xl whitespace-pre-wrap min-h-[200px]">{log || '// Output will appear here...'}</pre>
    </div>
  )
}
