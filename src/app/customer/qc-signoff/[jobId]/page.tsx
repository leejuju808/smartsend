'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Check, X, Download } from 'lucide-react'
import { QCInspection, QCInspectionItem, CustomerSignoff } from '@/types/database'

export default function CustomerSignoffPage() {
  const params = useParams()
  const jobId = params.jobId as string

  const [inspection, setInspection] = useState<QCInspection | null>(null)
  const [items, setItems] = useState<QCInspectionItem[]>([])
  const [signoff, setSignoff] = useState<CustomerSignoff | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const signatureRef = useRef<string | null>(null)

  useEffect(() => {
    loadInspection()
  }, [jobId])

  const loadInspection = async () => {
    try {
      // Get inspection for this job
      const res = await fetch(`/api/workforce/qc/inspections?job_id=${jobId}`)
      const data = await res.json()
      
      if (data.inspections && data.inspections.length > 0) {
        const inspectionId = data.inspections[0].id
        
        // Get full inspection details
        const detailRes = await fetch(`/api/workforce/qc/inspections/${inspectionId}`)
        const detailData = await detailRes.json()
        
        setInspection(detailData.inspection)
        setItems(detailData.inspection.items || [])
        setSignoff(detailData.inspection.customer_signoff || null)
        
        if (detailData.inspection.customer_signoff) {
          setCustomerName(detailData.inspection.customer_signoff.customer_name)
        }
      }
    } catch (error) {
      console.error('Error loading inspection:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  const handleCanvasMouseUp = () => {
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (!canvas) return

    // Save signature as data URL
    signatureRef.current = canvas.toDataURL('image/png')
  }

  const handleClearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    signatureRef.current = null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!customerName.trim()) {
      alert('Please enter your name')
      return
    }

    if (!signatureRef.current) {
      alert('Please provide your signature')
      return
    }

    if (!inspection) {
      alert('Inspection not found')
      return
    }

    setSigning(true)

    try {
      // Upload signature to storage
      const signatureBlob = await fetch(signatureRef.current).then((r) => r.blob())
      const formData = new FormData()
      formData.append('file', signatureBlob, `signature-${jobId}-${Date.now()}.png`)
      formData.append('jobId', jobId)

      // Upload signature (you'd implement this endpoint)
      const uploadRes = await fetch('/api/workforce/qc/upload-signature', {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        throw new Error('Failed to upload signature')
      }

      const { signature_url } = await uploadRes.json()

      // Create signoff
      const signoffRes = await fetch('/api/workforce/qc/signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          inspection_id: inspection.id,
          customer_name: customerName.trim(),
          signature_url,
        }),
      })

      if (signoffRes.ok) {
        const signoffData = await signoffRes.json()
        setSignoff(signoffData.signoff)
        alert('Thank you! Your signature has been recorded.')
      } else {
        throw new Error('Failed to save signature')
      }
    } catch (error) {
      console.error('Error submitting signature:', error)
      alert('Failed to submit signature. Please try again.')
    } finally {
      setSigning(false)
    }
  }

  const handleDownloadReport = async () => {
    if (!inspection) return

    try {
      const res = await fetch(`/api/workforce/qc/report?job_id=${jobId}&inspection_id=${inspection.id}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qc-report-${jobId}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading report:', error)
      alert('Failed to download report')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500">Loading inspection...</div>
        </div>
      </div>
    )
  }

  if (!inspection) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-900 font-semibold mb-2">Inspection Not Found</div>
          <div className="text-gray-600">No QC inspection found for this job.</div>
        </div>
      </div>
    )
  }

  const passedCount = items.filter((i) => i.passed === true).length
  const failedCount = items.filter((i) => i.passed === false).length
  const totalCount = items.length
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || 'Other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(item)
    return acc
  }, {} as Record<string, QCInspectionItem[]>)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Quality Control Inspection Report
          </h1>
          <p className="text-gray-600">
            Your roof installation has been inspected for quality and compliance.
          </p>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Inspection Summary</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{passedCount}</div>
              <div className="text-sm text-gray-600 mt-1">Passed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{failedCount}</div>
              <div className="text-sm text-gray-600 mt-1">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{passRate}%</div>
              <div className="text-sm text-gray-600 mt-1">Pass Rate</div>
            </div>
          </div>
        </div>

        {/* Checklist Results */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Inspection Details</h2>
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                <h3 className="font-medium text-gray-900 mb-2">{category}</h3>
                <div className="space-y-2">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      {item.passed === true ? (
                        <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      ) : item.passed === false ? (
                        <X className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{item.item}</p>
                        {item.notes && (
                          <p className="text-xs text-gray-600 mt-1">{item.notes}</p>
                        )}
                        {item.photo_url && (
                          <img
                            src={item.photo_url}
                            alt="QC photo"
                            className="mt-2 h-24 w-24 object-cover rounded border border-gray-200"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Signature Section */}
        {signoff ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="text-center">
              <div className="text-green-600 mb-2">
                <Check className="h-12 w-12 mx-auto" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Signed and Verified
              </h2>
              <p className="text-gray-600 mb-4">
                Signed by {signoff.customer_name} on{' '}
                {new Date(signoff.signed_at).toLocaleDateString()}
              </p>
              <img
                src={signoff.signature_url}
                alt="Signature"
                className="mx-auto h-24 border border-gray-200 rounded bg-white"
              />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Customer Sign-Off
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Signature
                </label>
                <div className="border-2 border-gray-300 rounded-lg bg-white">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className="w-full cursor-crosshair"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleClearSignature}
                  className="mt-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear Signature
                </button>
              </div>

              <button
                type="submit"
                disabled={signing}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {signing ? 'Submitting...' : 'Sign and Submit'}
              </button>
            </form>
          </div>
        )}

        {/* Download Report */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <button
            onClick={handleDownloadReport}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
          >
            <Download className="h-5 w-5" />
            Download QC Report PDF
          </button>
        </div>
      </div>
    </div>
  )
}
























