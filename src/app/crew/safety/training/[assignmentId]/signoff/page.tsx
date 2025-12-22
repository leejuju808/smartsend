'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle } from 'lucide-react'

type Assignment = {
  id: string
  module_id: string
  employee_id: string
  module: {
    title: string
    description: string | null
  }
}

export default function TrainingSignoffPage() {
  const router = useRouter()
  const params = useParams()
  const assignmentId = params?.assignmentId as string

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [signedName, setSignedName] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    if (assignmentId) {
      loadAssignment()
    }
  }, [assignmentId])

  const loadAssignment = async () => {
    try {
      const res = await fetch(`/api/safety/training/assignments?employee_id=current`)
      const data = await res.json()
      const assignment = data.assignments?.find((a: any) => a.id === assignmentId)
      if (assignment) {
        setAssignment(assignment)
      }
    } catch (error) {
      console.error('Error loading assignment:', error)
    } finally {
      setLoading(false)
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(x, y)
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignatureData(canvas.toDataURL())
    }
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      setSignatureData(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!signedName.trim()) {
      setError('Please enter your name')
      return
    }

    if (!signatureData) {
      setError('Please provide your signature')
      return
    }

    if (!confirmed) {
      setError('Please confirm that you understand the training')
      return
    }

    setSigning(true)

    try {
      // Get GPS coordinates if available
      let gpsLatitude: number | null = null
      let gpsLongitude: number | null = null

      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          })
          gpsLatitude = position.coords.latitude
          gpsLongitude = position.coords.longitude
        } catch (err) {
          console.warn('Could not get GPS coordinates:', err)
        }
      }

      const res = await fetch('/api/safety/training/signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignmentId,
          employee_id: assignment?.employee_id,
          signature_data: signatureData,
          signed_name: signedName,
          gps_latitude: gpsLatitude,
          gps_longitude: gpsLongitude,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit sign-off')
      }

      // Success - redirect back
      router.push('/crew/safety/training')
    } catch (err: any) {
      setError(err.message || 'Failed to submit sign-off')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center text-gray-500">Assignment not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Training Sign-Off</h1>
          <p className="text-sm text-gray-500 mt-1">
            {assignment.module.title}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Training Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-2">Training Summary</h2>
            <p className="text-sm text-gray-600">
              {assignment.module.description || 'You have completed the required training module.'}
            </p>
          </div>

          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your full name"
            />
          </div>

          {/* Signature Pad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Signature *
            </label>
            <div className="bg-white border-2 border-gray-300 rounded-lg p-4">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="border border-gray-200 rounded w-full cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none' }}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={clearSignature}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Sign above using your mouse or touch screen
            </p>
          </div>

          {/* Confirmation Checkbox */}
          <div className="flex items-start">
            <input
              type="checkbox"
              id="confirm"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 mr-3"
            />
            <label htmlFor="confirm" className="text-sm text-gray-700">
              I confirm that I have completed this training module and understand the safety procedures outlined. *
            </label>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={signing || !signedName || !signatureData || !confirmed}
              className="flex-1 px-4 py-3 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signing ? 'Submitting...' : 'Submit Sign-Off'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
























