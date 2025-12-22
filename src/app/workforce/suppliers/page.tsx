'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Building2, Phone, Mail, DollarSign, Star, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'

type Supplier = {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  credit_terms: string | null
  address: string | null
  status: string
  vendor_score: number | null
  category: string
  po_count: number
  balance: number
}

export default function SuppliersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    credit_terms: 'NET30',
    address: ''
  })

  useEffect(() => {
    loadSuppliers()
  }, [])

  const loadSuppliers = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/workforce/suppliers')
      const data = await res.json()
      setSuppliers(data.suppliers || [])
    } catch (error) {
      console.error('Error loading suppliers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Get company_id from user context (you may need to adjust this)
      const companyId = 'temp-company-id' // Replace with actual company ID

      const res = await fetch('/api/workforce/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          ...newSupplier
        })
      })

      if (res.ok) {
        setShowAddModal(false)
        setNewSupplier({
          name: '',
          contact_name: '',
          phone: '',
          email: '',
          credit_terms: 'NET30',
          address: ''
        })
        loadSuppliers()
      }
    } catch (error) {
      console.error('Error adding supplier:', error)
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Elite Vendor':
        return 'text-green-600 bg-green-50'
      case 'Reliable':
        return 'text-blue-600 bg-blue-50'
      case 'Needs Improvement':
        return 'text-yellow-600 bg-yellow-50'
      case 'Risk Vendor':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading suppliers...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Supplier Directory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage vendors, track performance, and monitor credit terms
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Total Suppliers</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{suppliers.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Elite Vendors</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {suppliers.filter(s => s.category === 'Elite Vendor').length}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Total POs</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {suppliers.reduce((sum, s) => sum + s.po_count, 0)}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Outstanding Balance</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(suppliers.reduce((sum, s) => sum + s.balance, 0))}
          </div>
        </div>
      </div>

      {/* Suppliers List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Supplier
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Credit Terms
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Performance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                POs
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Balance
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {suppliers.map((supplier) => (
              <tr key={supplier.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                      {supplier.address && (
                        <div className="text-sm text-gray-500">{supplier.address}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {supplier.contact_name && <div>{supplier.contact_name}</div>}
                    {supplier.phone && (
                      <div className="flex items-center text-gray-500">
                        <Phone className="h-3 w-3 mr-1" />
                        {supplier.phone}
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center text-gray-500">
                        <Mail className="h-3 w-3 mr-1" />
                        {supplier.email}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{supplier.credit_terms || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    {supplier.vendor_score !== null ? (
                      <>
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-400 mr-1" />
                          <span className="text-sm font-medium text-gray-900">
                            {supplier.vendor_score.toFixed(0)}
                          </span>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(supplier.category)}`}>
                          {supplier.category}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-gray-500">No ratings</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{supplier.po_count}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
                    <span className={`text-sm font-medium ${
                      supplier.balance > 25000 ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(supplier.balance)}
                    </span>
                    {supplier.balance > 25000 && (
                      <AlertTriangle className="h-4 w-4 text-red-500 ml-1" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Supplier</h2>
            <form onSubmit={handleAddSupplier} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  required
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={newSupplier.contact_name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, contact_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Credit Terms
                </label>
                <select
                  value={newSupplier.credit_terms}
                  onChange={(e) => setNewSupplier({ ...newSupplier, credit_terms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="COD">COD</option>
                  <option value="NET30">NET30</option>
                  <option value="NET60">NET60</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={2}
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Add Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
























