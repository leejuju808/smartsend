'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, AlertTriangle, X } from 'lucide-react'

type IncidentType = 
  | 'near_miss'
  | 'injury'
  | 'property_damage'
  | 'equipment_failure'
  | 'safety_violation'
  | 'other'

type Severity = 'low' | 'medium' | 'high' | 'critical'

export default function SafetyIncidentReportPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    incident_type: '' as IncidentType | '',
    description: '',
    severity: 'low' as Severity,
    job_id: '',
    employee_id: '',
    photo_url: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const incidentTypes: { value: IncidentType | ''; label: string }[] = [
    { value: '', label: 'Select type...' },
    { value: 'near_miss', label: 'Near Miss' },
    { value: 'injury', label: 'Injury' },
    { value: 'property_damage', label: 'Property Damage' },
    { value: 'equipment_failure', label: 'Equipment Failure' },
    { value: 'safety_violation', label: 'Safety Violation' },
    { value: 'other', label: 'Other' },
  ]

  const severities: { value: Severity; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'bg-blue-100 text-blue-800' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
    { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800' },
  ]

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      let photoUrl = formData.photo_url

      // Upload photo if provided
      if (photoFile) {
        // In a real implementation, upload to Supabase Storage
        // For now, we'll use the data URL
        photoUrl = photoPreview || ''
      }

      const res = await fetch('/api/safety/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          photo_url: photoUrl,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit incident report')
      }

      // Success - redirect back
      router.push('/crew/safety')
    } catch (err: any) {
      setError(err.message || 'Failed to submit incident report')
    } finally {
      setSubmitting(false)
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Report Safety Incident</h1>
          <p className="text-sm text-gray-500 mt-1">
            Report near misses, injuries, violations, or unsafe conditions
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

          {/* Warning Banner */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" />
              <div>
                <h3 className="font-medium text-yellow-900">Important</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  For critical incidents or injuries, contact emergency services immediately.
                  This form is for documentation purposes.
                </p>
              </div>
            </div>
          </div>

          {/* Incident Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Incident Type *
            </label>
            <select
              required
              value={formData.incident_type}
              onChange={(e) => setFormData({ ...formData, incident_type: e.target.value as IncidentType | '' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {incidentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Severity *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {severities.map((severity) => (
                <button
                  key={severity.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, severity: severity.value })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.severity === severity.value
                      ? severity.color + ' ring-2 ring-offset-2 ring-blue-500'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {severity.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Describe what happened, when it occurred, who was involved, and any contributing factors..."
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Photo (Optional)
            </label>
            <div className="space-y-2">
              {photoPreview && (
                <div className="relative">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-lg border border-gray-300"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFile(null)
                      setPhotoPreview(null)
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <label className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400">
                <Camera className="h-5 w-5 text-gray-400 mr-2" />
                <span className="text-sm text-gray-600">
                  {photoFile ? 'Change Photo' : 'Upload Photo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Job ID (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job ID (Optional)
            </label>
            <input
              type="text"
              value={formData.job_id}
              onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="If incident occurred on a specific job"
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 border border-transparent rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
























