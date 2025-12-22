'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, XCircle, FileText, DollarSign } from 'lucide-react'

type ChangeOrder = {
  id: string
  job_id: string
  change_order_number: string | null
  description: string
  price_difference: number
  status: string
  jobs: {
    homeowner_name: string | null
    address: string | null
  } | null
}

export default function ChangeOrderSignaturePage() {
  const params = useParams()
  const token = params.token as string

  const [changeOrder, setChangeOrder] = useState<ChangeOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)

  useEffect(() => {
    loadChangeOrder()
  }, [token])

  const loadChangeOrder = async () => {
    try {
      const res = await fetch(`/api/workforce/change-orders/sign/${token}`)
      const data = await res.json()

      if (res.ok) {
        setChangeOrder(data.change_order)
        if (data.change_order.status === 'approved' || data.change_order.status === 'signed') {
          setSigned(true)
        } else if (data.change_order.status === 'rejected') {
          setRejected(true)
        }
      } else {
        alert(data.error || 'Change order not found')
      }
    } catch (error) {
      console.error('Error loading change order:', error)
      alert('Failed to load change order')
    } finally {
      setLoading(false)
    }
  }

  const handleSign = async (approved: boolean) => {
    if (approved && !customerName.trim()) {
      alert('Please enter your name')
      return
    }

    setSigning(true)
    try {
      const res = await fetch(`/api/workforce/change-orders/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          customer_name: customerName.trim(),
          signature_data: signature,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        if (approved) {
          setSigned(true)
        } else {
          setRejected(true)
        }
        setChangeOrder(data.change_order)
      } else {
        alert(data.error || 'Failed to process signature')
      }
    } catch (error) {
      console.error('Error signing change order:', error)
      alert('Failed to process signature')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500">Loading change order...</div>
        </div>
      </div>
    )
  }

  if (!changeOrder) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Change Order Not Found</h1>
          <p className="text-gray-600">This change order link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Change Order Approved</h1>
          <p className="text-gray-600 mb-4">
            Thank you for approving this change order. The project team has been notified.
          </p>
          {changeOrder.change_order_number && (
            <p className="text-sm text-gray-500">
              Change Order: {changeOrder.change_order_number}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (rejected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Change Order Rejected</h1>
          <p className="text-gray-600 mb-4">
            You have rejected this change order. The project team has been notified.
          </p>
          {changeOrder.change_order_number && (
            <p className="text-sm text-gray-500">
              Change Order: {changeOrder.change_order_number}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 px-6 py-4">
            <h1 className="text-2xl font-semibold text-white">Change Order Request</h1>
            {changeOrder.change_order_number && (
              <p className="text-blue-100 mt-1">Change Order: {changeOrder.change_order_number}</p>
            )}
          </div>

          {/* Job Info */}
          {changeOrder.jobs && (
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-500 mb-2">Project Information</h2>
              {changeOrder.jobs.homeowner_name && (
                <p className="text-gray-900">{changeOrder.jobs.homeowner_name}</p>
              )}
              {changeOrder.jobs.address && (
                <p className="text-gray-600">{changeOrder.jobs.address}</p>
              )}
            </div>
          )}

          {/* Change Order Details */}
          <div className="px-6 py-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Description
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">{changeOrder.description}</p>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <DollarSign className="mr-2 h-5 w-5" />
                Price Adjustment
              </h2>
              <div className={`text-3xl font-bold ${changeOrder.price_difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {changeOrder.price_difference >= 0 ? '+' : ''}${changeOrder.price_difference.toFixed(2)}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {changeOrder.price_difference >= 0 
                  ? 'This amount will be added to your contract total.'
                  : 'This amount will be deducted from your contract total.'
                }
              </p>
            </div>

            {/* Signature Section */}
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Signature</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Simple signature pad (you can enhance this with a proper signature library) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Signature (Type your name to sign)
                  </label>
                  <input
                    type="text"
                    value={signature || ''}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder="Type your name to sign"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-6 border-t border-gray-200">
              <button
                onClick={() => handleSign(false)}
                disabled={signing}
                className="flex-1 px-6 py-3 border-2 border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="inline-block mr-2 h-5 w-5" />
                Reject
              </button>
              <button
                onClick={() => handleSign(true)}
                disabled={signing || !customerName.trim()}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {signing ? (
                  'Processing...'
                ) : (
                  <>
                    <CheckCircle className="inline-block mr-2 h-5 w-5" />
                    Approve & Sign
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>By signing, you acknowledge that you have reviewed and agree to this change order.</p>
        </div>
      </div>
    </div>
  )
}
























