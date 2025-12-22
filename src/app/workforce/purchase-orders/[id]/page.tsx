'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, CheckCircle, FileText, Upload, Download, DollarSign, Package } from 'lucide-react'

type PurchaseOrder = {
  id: string
  po_number: string
  status: string
  total_estimated: number
  total_invoiced: number | null
  invoice_total: number
  variance: number
  variance_percent: number
  variance_status: string
  suppliers: {
    id: string
    name: string
    contact_name: string | null
    phone: string | null
    email: string | null
  }
  purchase_order_items: Array<{
    id: string
    material_name: string
    quantity: number
    unit_cost: number
    total_cost: number
  }>
  supplier_invoices: Array<{
    id: string
    invoice_number: string | null
    amount: number
    invoice_url: string | null
    received_at: string
  }>
  supplier_delivery_records: Array<{
    id: string
    delivered_at: string
    photo_url: string | null
    notes: string | null
  }>
  jobs: {
    id: string
    address: string | null
    homeowner_name: string | null
  } | null
}

export default function PODetailPage() {
  const router = useRouter()
  const params = useParams()
  const poId = params.id as string

  const [loading, setLoading] = useState(true)
  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceData, setInvoiceData] = useState({
    invoice_number: '',
    amount: '',
    invoice_url: ''
  })

  useEffect(() => {
    loadPO()
  }, [poId])

  const loadPO = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/workforce/purchase-orders/${poId}`)
      const data = await res.json()
      setPo(data.purchase_order)
    } catch (error) {
      console.error('Error loading PO:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/workforce/purchase-orders/${poId}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_number: invoiceData.invoice_number,
          amount: parseFloat(invoiceData.amount),
          invoice_url: invoiceData.invoice_url
        })
      })

      if (res.ok) {
        setShowInvoiceModal(false)
        setInvoiceData({ invoice_number: '', amount: '', invoice_url: '' })
        loadPO()
      } else {
        const error = await res.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error uploading invoice:', error)
      alert('Error uploading invoice')
    }
  }

  const handleGenerateDisputePacket = async () => {
    // This would generate a PDF with PO, photos, invoice, and variance analysis
    // For now, we'll create an API endpoint for this
    try {
      const res = await fetch(`/api/workforce/purchase-orders/${poId}/dispute-packet`, {
        method: 'GET'
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dispute-packet-${po?.po_number || poId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Error generating dispute packet')
      }
    } catch (error) {
      console.error('Error generating dispute packet:', error)
      alert('Error generating dispute packet')
    }
  }

  const getVarianceAlert = () => {
    if (!po) return null

    if (po.variance_status === 'discrepancy') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">🚨 DISCREPANCY ALERT</h3>
              <p className="text-sm text-red-700 mt-1">
                Invoice mismatch exceeds company threshold ({Math.abs(po.variance_percent).toFixed(1)}% variance).
                PO flagged for dispute.
              </p>
              <p className="text-sm text-red-700 mt-1">
                Variance: {po.variance > 0 ? '+' : ''}{po.variance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </p>
            </div>
          </div>
        </div>
      )
    }

    if (po.variance_status === 'warning') {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-800">⚠️ INVOICE WARNING</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Supplier charged {po.variance > 0 ? 'more' : 'less'} than PO ({Math.abs(po.variance_percent).toFixed(1)}% variance).
                Review required.
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Variance: {po.variance > 0 ? '+' : ''}{po.variance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start">
          <CheckCircle className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-green-800">Invoice Matched</h3>
            <p className="text-sm text-green-700 mt-1">
              Invoice amount matches PO within acceptable variance.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading purchase order...</div>
      </div>
    )
  }

  if (!po) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Purchase order not found</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/workforce/suppliers"
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Purchase Order {po.po_number}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {po.jobs?.address && `Job: ${po.jobs.address}`}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {po.variance_status === 'discrepancy' && (
            <button
              onClick={handleGenerateDisputePacket}
              className="inline-flex items-center px-4 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 bg-white hover:bg-red-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Generate Dispute Packet
            </button>
          )}
          <button
            onClick={() => setShowInvoiceModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Invoice
          </button>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center space-x-2">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          po.status === 'closed' ? 'bg-green-100 text-green-800' :
          po.status === 'disputed' ? 'bg-red-100 text-red-800' :
          po.status === 'invoiced' ? 'bg-blue-100 text-blue-800' :
          po.status === 'delivered' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {po.status.toUpperCase()}
        </span>
      </div>

      {/* Invoice Reconciliation Alert */}
      {po.supplier_invoices && po.supplier_invoices.length > 0 && getVarianceAlert()}

      {/* Supplier Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Supplier</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium text-gray-700">Name</div>
            <div className="text-sm text-gray-900 mt-1">{po.suppliers.name}</div>
          </div>
          {po.suppliers.contact_name && (
            <div>
              <div className="text-sm font-medium text-gray-700">Contact</div>
              <div className="text-sm text-gray-900 mt-1">{po.suppliers.contact_name}</div>
            </div>
          )}
          {po.suppliers.phone && (
            <div>
              <div className="text-sm font-medium text-gray-700">Phone</div>
              <div className="text-sm text-gray-900 mt-1">{po.suppliers.phone}</div>
            </div>
          )}
          {po.suppliers.email && (
            <div>
              <div className="text-sm font-medium text-gray-700">Email</div>
              <div className="text-sm text-gray-900 mt-1">{po.suppliers.email}</div>
            </div>
          )}
        </div>
      </div>

      {/* PO Items */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Material List</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {po.purchase_order_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{item.material_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    ${item.unit_cost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    ${item.total_cost.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                  Total Estimated:
                </td>
                <td className="px-4 py-3 text-sm font-bold text-gray-900">
                  ${po.total_estimated.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Invoices</h2>
        {po.supplier_invoices && po.supplier_invoices.length > 0 ? (
          <div className="space-y-3">
            {po.supplier_invoices.map((invoice) => (
              <div key={invoice.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {invoice.invoice_number || 'No Invoice Number'}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      ${invoice.amount.toFixed(2)} • {new Date(invoice.received_at).toLocaleDateString()}
                    </div>
                  </div>
                  {invoice.invoice_url && (
                    <a
                      href={invoice.invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <FileText className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">Total Invoiced:</div>
                <div className="text-lg font-bold text-gray-900">
                  ${po.invoice_total.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No invoices uploaded yet
          </div>
        )}
      </div>

      {/* Delivery Records */}
      {po.supplier_delivery_records && po.supplier_delivery_records.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Delivery Records</h2>
          <div className="space-y-3">
            {po.supplier_delivery_records.map((delivery) => (
              <div key={delivery.id} className="border border-gray-200 rounded-lg p-3">
                <div className="text-sm text-gray-900">
                  Delivered: {new Date(delivery.delivered_at).toLocaleString()}
                </div>
                {delivery.notes && (
                  <div className="text-sm text-gray-500 mt-1">{delivery.notes}</div>
                )}
                {delivery.photo_url && (
                  <img src={delivery.photo_url} alt="Delivery" className="mt-2 rounded max-w-xs" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Upload Invoice</h2>
            <form onSubmit={handleUploadInvoice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoiceData.invoice_number}
                  onChange={(e) => setInvoiceData({ ...invoiceData, invoice_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={invoiceData.amount}
                  onChange={(e) => setInvoiceData({ ...invoiceData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice URL (optional)
                </label>
                <input
                  type="url"
                  value={invoiceData.invoice_url}
                  onChange={(e) => setInvoiceData({ ...invoiceData, invoice_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="https://..."
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Upload Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
























