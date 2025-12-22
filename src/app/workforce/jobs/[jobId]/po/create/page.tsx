'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Save, Send, Package } from 'lucide-react'

type MaterialItem = {
  id: string
  name: string
  quantity_expected: number
  unit: string | null
}

type Supplier = {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
}

type POItem = {
  material_name: string
  quantity: number
  unit_cost: number
}

type Job = {
  id: string
  address: string | null
  homeowner_name: string | null
  production_date: string | null
  crew_id: string | null
}

export default function CreatePOPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [poItems, setPoItems] = useState<POItem[]>([])
  const [companyId, setCompanyId] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [jobId])

  const loadData = async () => {
    try {
      setLoading(true)

      // Load job
      const jobRes = await fetch(`/api/workforce/jobs/${jobId}`)
      const jobData = await jobRes.json()
      const jobInfo = jobData.job || jobData
      setJob(jobInfo)
      if (jobInfo?.company_id) {
        setCompanyId(jobInfo.company_id)
      } else {
        // Fallback: try to get from job directly
        const { company_id, ...rest } = jobInfo
        if (company_id) {
          setCompanyId(company_id)
        }
      }

      // Load material items from job
      const materialsRes = await fetch(`/api/materials/items?job_id=${jobId}`)
      const materialsData = await materialsRes.json()
      setMaterialItems(materialsData.items || [])

      // Auto-fill PO items from material_items
      if (materialsData.items && materialsData.items.length > 0) {
        const autoItems: POItem[] = materialsData.items.map((item: MaterialItem) => ({
          material_name: item.name,
          quantity: item.quantity_expected,
          unit_cost: 0 // User will fill in pricing
        }))
        setPoItems(autoItems)
      }

      // Load suppliers
      const suppliersRes = await fetch('/api/workforce/suppliers')
      const suppliersData = await suppliersRes.json()
      setSuppliers(suppliersData.suppliers || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = () => {
    setPoItems([...poItems, { material_name: '', quantity: 0, unit_cost: 0 }])
  }

  const handleRemoveItem = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, field: keyof POItem, value: string | number) => {
    const updated = [...poItems]
    updated[index] = { ...updated[index], [field]: value }
    setPoItems(updated)
  }

  const handleSave = async (status: 'draft' | 'sent' = 'draft') => {
    if (!selectedSupplier || !companyId || poItems.length === 0) {
      alert('Please select a supplier and add at least one item')
      return
    }

    try {
      setSaving(true)

      const res = await fetch('/api/workforce/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          job_id: jobId,
          supplier_id: selectedSupplier,
          items: poItems
        })
      })

      if (res.ok) {
        const data = await res.json()
        if (status === 'sent') {
          // Update PO status to 'sent'
          await fetch(`/api/workforce/purchase-orders/${data.purchase_order.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'sent' })
          })
        }
        router.push(`/workforce/jobs/${jobId}`)
      } else {
        const error = await res.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error saving PO:', error)
      alert('Error saving purchase order')
    } finally {
      setSaving(false)
    }
  }

  const calculateTotal = () => {
    return poItems.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href={`/workforce/jobs/${jobId}`}
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Purchase Order</h1>
            <p className="mt-1 text-sm text-gray-500">
              {job?.address && `Job: ${job.address}`}
              {job?.homeowner_name && ` • ${job.homeowner_name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </button>
          <button
            onClick={() => handleSave('sent')}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="mr-2 h-4 w-4" />
            Send to Supplier
          </button>
        </div>
      </div>

      {/* Job Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Job Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Delivery Address</label>
            <div className="mt-1 text-sm text-gray-900">{job?.address || 'N/A'}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Job Start Date</label>
            <div className="mt-1 text-sm text-gray-900">
              {job?.production_date ? new Date(job.production_date).toLocaleDateString() : 'Not scheduled'}
            </div>
          </div>
        </div>
      </div>

      {/* Supplier Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Supplier</h2>
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">Select a supplier...</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
              {supplier.contact_name && ` - ${supplier.contact_name}`}
            </option>
          ))}
        </select>
      </div>

      {/* Material Items */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Material List</h2>
          <button
            onClick={handleAddItem}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Item
          </button>
        </div>

        {materialItems.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-md">
            <div className="flex items-center">
              <Package className="h-4 w-4 text-blue-600 mr-2" />
              <span className="text-sm text-blue-800">
                Auto-filled {materialItems.length} material(s) from job plan. Edit quantities and add pricing.
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {poItems.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-5">
                <input
                  type="text"
                  value={item.material_name}
                  onChange={(e) => handleUpdateItem(index, 'material_name', e.target.value)}
                  placeholder="Material name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleUpdateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                  placeholder="Qty"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.unit_cost}
                  onChange={(e) => handleUpdateItem(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                  placeholder="Unit Cost"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="col-span-2 text-sm font-medium text-gray-900">
                ${(item.quantity * item.unit_cost).toFixed(2)}
              </div>
              <div className="col-span-1">
                <button
                  onClick={() => handleRemoveItem(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {poItems.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No items added. Click "Add Item" to get started.
          </div>
        )}

        {poItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-end">
              <div className="text-right">
                <div className="text-sm text-gray-500">Total Estimated</div>
                <div className="text-2xl font-bold text-gray-900">
                  ${calculateTotal().toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
























