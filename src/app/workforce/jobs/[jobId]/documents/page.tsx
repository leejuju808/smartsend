'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Plus, 
  Upload, 
  Download, 
  FileText, 
  RefreshCw,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Image as ImageIcon,
  File,
  Building2,
  ClipboardCheck,
  Camera
} from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type JobDocument = {
  id: string
  job_id: string
  doc_type: string
  name: string
  file_url: string
  storage_path: string | null
  version: number
  is_active: boolean
  photo_category: string | null
  uploaded_by: string | null
  description: string | null
  created_at: string
  workforce_employees: {
    first_name: string
    last_name: string
  } | null
}

type ChangeOrder = {
  id: string
  job_id: string
  change_order_number: string | null
  description: string
  price_difference: number
  status: string
  customer_signed_at: string | null
  created_at: string
}

type Permit = {
  id: string
  job_id: string
  permit_number: string | null
  issued_by: string | null
  status: string
  expires_on: string | null
  file_url: string | null
  created_at: string
}

type InspectionReport = {
  id: string
  job_id: string
  inspector_name: string | null
  inspector_type: string | null
  passed: boolean | null
  status: string
  inspection_date: string | null
  created_at: string
}

export default function JobDocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string
  const supabase = createClientComponentClient()

  const [activeTab, setActiveTab] = useState<'contracts' | 'change-orders' | 'permits' | 'plans' | 'photos' | 'inspections' | 'misc'>('contracts')
  const [documents, setDocuments] = useState<JobDocument[]>([])
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [permits, setPermits] = useState<Permit[]>([])
  const [inspections, setInspections] = useState<InspectionReport[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [viewingPlan, setViewingPlan] = useState<JobDocument | null>(null)

  useEffect(() => {
    loadData()
  }, [jobId, activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load documents based on active tab
      const docTypeMap: Record<string, string> = {
        'contracts': 'contract',
        'change-orders': 'change_order',
        'permits': 'permit',
        'plans': 'plan',
        'photos': 'photo',
        'inspections': 'inspection',
        'misc': 'misc'
      }

      const docType = docTypeMap[activeTab]

      if (activeTab === 'change-orders') {
        const res = await fetch(`/api/workforce/jobs/${jobId}/change-orders`)
        const data = await res.json()
        setChangeOrders(data.change_orders || [])
      } else if (activeTab === 'permits') {
        const res = await fetch(`/api/workforce/jobs/${jobId}/permits`)
        const data = await res.json()
        setPermits(data.permits || [])
      } else if (activeTab === 'inspections') {
        const res = await fetch(`/api/workforce/jobs/${jobId}/inspections`)
        const data = await res.json()
        setInspections(data.inspections || [])
      } else {
        const res = await fetch(`/api/workforce/jobs/${jobId}/documents?type=${docType}`)
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const [photoCategory, setPhotoCategory] = useState<string>('')

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const docType = activeTab === 'contracts' ? 'contract' : 
                      activeTab === 'plans' ? 'plan' : 
                      activeTab === 'photos' ? 'photo' : 'misc'
      formData.append('doc_type', docType)
      formData.append('name', file.name)
      if (activeTab === 'photos' && photoCategory) {
        formData.append('photo_category', photoCategory)
      }

      const res = await fetch(`/api/workforce/jobs/${jobId}/documents/upload`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        setShowUploadModal(false)
        setPhotoCategory('')
        loadData()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to upload document')
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = (fileUrl: string, fileName: string) => {
    window.open(fileUrl, '_blank')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
      case 'passed':
      case 'signed':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="mr-1 h-3 w-3" />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )
      case 'pending':
      case 'scheduled':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="mr-1 h-3 w-3" />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )
      case 'rejected':
      case 'failed':
      case 'expired':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="mr-1 h-3 w-3" />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        )
    }
  }

  const getPermitExpirationWarning = (expiresOn: string | null, status: string) => {
    if (!expiresOn || status !== 'approved') return null
    
    const expirationDate = new Date(expiresOn)
    const today = new Date()
    const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysUntilExpiration < 0) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Expired
        </span>
      )
    } else if (daysUntilExpiration <= 10) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Expires in {daysUntilExpiration} days
        </span>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/workforce/jobs/${jobId}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Job
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Job Documents</h1>
          <p className="text-sm text-gray-600 mt-1">Central document repository for this job</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'contracts', label: '📄 Contracts', icon: FileText },
            { id: 'change-orders', label: '🔁 Change Orders', icon: RefreshCw },
            { id: 'permits', label: '🧾 Permits', icon: Building2 },
            { id: 'plans', label: '🛠 Plans & Drawings', icon: FileCheck },
            { id: 'photos', label: '📸 Photos', icon: Camera },
            { id: 'inspections', label: '📝 Inspections', icon: ClipboardCheck },
            { id: 'misc', label: '📦 Misc Docs', icon: File },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="flex items-center">
                  <Icon className="mr-2 h-4 w-4" />
                  {tab.label}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Contracts Tab */}
        {activeTab === 'contracts' && (
          <div className="divide-y divide-gray-200">
            {documents.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No contracts uploaded yet. Upload your first contract to get started.
              </div>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{doc.name}</span>
                        {doc.is_active && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                        <span className="text-sm text-gray-500">v{doc.version}</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {doc.workforce_employees && (
                          <div>
                            Uploaded by: {doc.workforce_employees.first_name} {doc.workforce_employees.last_name}
                          </div>
                        )}
                        <div>
                          {new Date(doc.created_at).toLocaleDateString()} at {new Date(doc.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(doc.file_url, doc.name)}
                      className="ml-4 inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Change Orders Tab */}
        {activeTab === 'change-orders' && (
          <div className="divide-y divide-gray-200">
            {changeOrders.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No change orders yet. Create your first change order to get started.
              </div>
            ) : (
              changeOrders.map((co) => (
                <div key={co.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <RefreshCw className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {co.change_order_number || `Change Order #${co.id.slice(0, 8)}`}
                        </span>
                        {getStatusBadge(co.status)}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">{co.description}</div>
                      <div className="text-sm text-gray-500">
                        <div>
                          Price Difference: <span className={co.price_difference >= 0 ? 'text-green-600' : 'text-red-600'}>
                            ${co.price_difference >= 0 ? '+' : ''}{co.price_difference.toFixed(2)}
                          </span>
                        </div>
                        {co.customer_signed_at && (
                          <div>Signed: {new Date(co.customer_signed_at).toLocaleDateString()}</div>
                        )}
                        <div>Created: {new Date(co.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {co.status === 'pending' && (
                        <Link
                          href={`/workforce/jobs/${jobId}/change-orders/${co.id}`}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          View & Send
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Permits Tab */}
        {activeTab === 'permits' && (
          <div className="divide-y divide-gray-200">
            {permits.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No permits added yet. Add your first permit to get started.
              </div>
            ) : (
              permits.map((permit) => (
                <div key={permit.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Building2 className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {permit.permit_number || 'Permit #' + permit.id.slice(0, 8)}
                        </span>
                        {getStatusBadge(permit.status)}
                        {getPermitExpirationWarning(permit.expires_on, permit.status)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {permit.issued_by && <div>Issued by: {permit.issued_by}</div>}
                        {permit.expires_on && (
                          <div>
                            Expires: {new Date(permit.expires_on).toLocaleDateString()}
                          </div>
                        )}
                        <div>Created: {new Date(permit.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    {permit.file_url && (
                      <button
                        onClick={() => handleDownload(permit.file_url!, permit.permit_number || 'permit')}
                        className="ml-4 inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <div className="divide-y divide-gray-200">
            {documents.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No plans or drawings uploaded yet. Upload your first plan to get started.
              </div>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <FileCheck className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{doc.name}</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => setViewingPlan(doc)}
                      className="ml-4 inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      View
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === 'photos' && (
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {documents.length === 0 ? (
                <div className="col-span-full text-center py-12 text-gray-500">
                  No photos uploaded yet. Upload your first photo to get started.
                </div>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className="relative group">
                    <img
                      src={doc.file_url}
                      alt={doc.name}
                      className="w-full h-48 object-cover rounded-lg border border-gray-200"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity rounded-lg flex items-center justify-center">
                      <button
                        onClick={() => handleDownload(doc.file_url, doc.name)}
                        className="opacity-0 group-hover:opacity-100 text-white"
                      >
                        <Download className="h-6 w-6" />
                      </button>
                    </div>
                    {doc.photo_category && (
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-50 text-white text-xs rounded">
                        {doc.photo_category}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Inspections Tab */}
        {activeTab === 'inspections' && (
          <div className="divide-y divide-gray-200">
            {inspections.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No inspection reports yet. Add your first inspection report to get started.
              </div>
            ) : (
              inspections.map((inspection) => (
                <div key={inspection.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <ClipboardCheck className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {inspection.inspector_name || 'Inspection Report'}
                        </span>
                        {getStatusBadge(inspection.status)}
                        {inspection.passed !== null && (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            inspection.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {inspection.passed ? 'Passed' : 'Failed'}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {inspection.inspector_type && <div>Type: {inspection.inspector_type}</div>}
                        {inspection.inspection_date && (
                          <div>Date: {new Date(inspection.inspection_date).toLocaleDateString()}</div>
                        )}
                        <div>Created: {new Date(inspection.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Misc Docs Tab */}
        {activeTab === 'misc' && (
          <div className="divide-y divide-gray-200">
            {documents.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                No miscellaneous documents uploaded yet.
              </div>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <File className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{doc.name}</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(doc.file_url, doc.name)}
                      className="ml-4 inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Upload Document</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select File
                </label>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  accept={activeTab === 'photos' ? 'image/*' : activeTab === 'plans' ? '.pdf,image/*' : undefined}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              {activeTab === 'photos' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Photo Category
                  </label>
                  <select
                    value={photoCategory}
                    onChange={(e) => setPhotoCategory(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select category...</option>
                    <option value="before">Before</option>
                    <option value="during">During</option>
                    <option value="after">After</option>
                    <option value="material_delivery">Material Delivery</option>
                    <option value="damage_report">Damage Report</option>
                    <option value="qc_inspection">QC Inspection</option>
                    <option value="warranty_item">Warranty Item</option>
                  </select>
                </div>
              )}
              {uploading && (
                <div className="text-sm text-gray-500">Uploading...</div>
              )}
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploading}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Viewer Modal */}
      {viewingPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{viewingPlan.name}</h2>
              <button
                onClick={() => setViewingPlan(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {viewingPlan.mime_type === 'application/pdf' || viewingPlan.file_url.endsWith('.pdf') ? (
                <iframe
                  src={viewingPlan.file_url}
                  className="w-full h-full min-h-[600px] border border-gray-200 rounded"
                  title={viewingPlan.name}
                />
              ) : (
                <img
                  src={viewingPlan.file_url}
                  alt={viewingPlan.name}
                  className="max-w-full h-auto mx-auto"
                />
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => handleDownload(viewingPlan.file_url, viewingPlan.name)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
























