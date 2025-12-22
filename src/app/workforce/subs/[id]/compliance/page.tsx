'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, AlertTriangle, CheckCircle, X, Calendar } from 'lucide-react'

type Document = {
  id: string
  doc_type: string
  file_url: string
  expires_at: string | null
  uploaded_at: string
}

type Subcontractor = {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
}

export default function CompliancePage() {
  const router = useRouter()
  const params = useParams()
  const subId = params.id as string

  const [sub, setSub] = useState<Subcontractor | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadData()
  }, [subId])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/workforce/subs/${subId}`)
      const data = await res.json()
      setSub(data.subcontractor)
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setUploading(true)

    const formData = new FormData(e.currentTarget)
    const docType = formData.get('doc_type') as string
    const expiresAt = formData.get('expires_at') as string

    // In a real implementation, you would upload the file to Supabase Storage first
    // For now, we'll use a placeholder URL
    const fileInput = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement
    const file = fileInput?.files?.[0]

    if (!file) {
      alert('Please select a file')
      setUploading(false)
      return
    }

    // TODO: Upload file to Supabase Storage and get the URL
    // For now, we'll use a placeholder
    const fileUrl = `https://storage.example.com/${file.name}`

    try {
      const res = await fetch(`/api/workforce/subs/${subId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: docType,
          file_url: fileUrl,
          expires_at: expiresAt || null,
        }),
      })

      if (res.ok) {
        setShowUploadModal(false)
        loadData()
        e.currentTarget.reset()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to upload document')
      }
    } catch (error) {
      console.error('Error uploading document:', error)
      alert('Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const res = await fetch(`/api/workforce/subs/${subId}/documents/${docId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        loadData()
      }
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const getDocStatus = (doc: Document) => {
    if (!doc.expires_at) return { status: 'valid', label: 'Valid', color: 'green' }
    const expiresDate = new Date(doc.expires_at)
    const today = new Date()
    const daysUntilExpiry = Math.ceil((expiresDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) {
      return { status: 'expired', label: 'Expired', color: 'red' }
    } else if (daysUntilExpiry <= 30) {
      return { status: 'expiring', label: `Expires in ${daysUntilExpiry} days`, color: 'yellow' }
    }
    return { status: 'valid', label: 'Valid', color: 'green' }
  }

  const requiredDocs = ['W9', 'COI', 'License']
  const hasRequiredDocs = requiredDocs.map((type) => ({
    type,
    has: documents.some((d) => d.doc_type === type && getDocStatus(d).status !== 'expired'),
  }))

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!sub) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-500">Subcontractor not found</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/workforce/subs"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Subcontractors
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Compliance Vault</h1>
          <p className="text-sm text-gray-600 mt-1">{sub.name}</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Required Documents Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Required Documents</h2>
        <div className="grid grid-cols-3 gap-4">
          {hasRequiredDocs.map(({ type, has }) => (
            <div
              key={type}
              className={`p-4 rounded-lg border-2 ${
                has
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{type}</span>
                {has ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <X className="h-5 w-5 text-red-600" />
                )}
              </div>
              <span className={`text-sm ${has ? 'text-green-700' : 'text-red-700'}`}>
                {has ? 'On File' : 'Missing'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">All Documents</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {documents.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No documents uploaded yet. Upload your first document to get started.
            </div>
          ) : (
            documents.map((doc) => {
              const status = getDocStatus(doc)
              return (
                <div key={doc.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">{doc.doc_type}</span>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            status.color === 'green'
                              ? 'bg-green-100 text-green-800'
                              : status.color === 'yellow'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                        {doc.expires_at && (
                          <span className="ml-4">
                            Expires: {new Date(doc.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-900 text-sm"
                      >
                        View
                      </a>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Upload Document</h2>
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type *
                </label>
                <select
                  name="doc_type"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select type...</option>
                  <option value="W9">W9</option>
                  <option value="COI">Certificate of Insurance (COI)</option>
                  <option value="License">License</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiration Date (if applicable)
                </label>
                <input
                  type="date"
                  name="expires_at"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
























