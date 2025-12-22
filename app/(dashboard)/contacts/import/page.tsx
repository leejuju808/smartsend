'use client'
import { useState } from 'react'

export default function ImportContactsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/contacts/import', { 
        method: 'POST', 
        body: formData 
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Import failed')
      }
      
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'An error occurred during import')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Import Contacts CSV</h1>
      
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-medium text-blue-900 mb-2">CSV Format</h2>
        <p className="text-sm text-blue-700">
          Your CSV should include these columns: <code className="bg-blue-100 px-1 rounded">email</code>, 
          <code className="bg-blue-100 px-1 rounded mx-1">first_name</code>, 
          <code className="bg-blue-100 px-1 rounded">last_name</code>, 
          <code className="bg-blue-100 px-1 rounded mx-1">company</code>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select CSV File
          </label>
          <input 
            type="file" 
            accept=".csv" 
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        
        <button 
          type="submit"
          disabled={!file || loading} 
          className="bg-blue-600 text-white rounded-lg p-3 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700 transition"
        >
          {loading ? 'Uploading...' : 'Import Contacts'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-900 mb-3">Import Complete</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Rows</p>
              <p className="text-lg font-semibold text-gray-900">{result.total}</p>
            </div>
            <div>
              <p className="text-gray-600">✅ Imported</p>
              <p className="text-lg font-semibold text-green-600">{result.imported}</p>
            </div>
            <div>
              <p className="text-gray-600">🚫 Suppressed</p>
              <p className="text-lg font-semibold text-orange-600">{result.suppressed}</p>
            </div>
            <div>
              <p className="text-gray-600">⚠️ Invalid</p>
              <p className="text-lg font-semibold text-red-600">{result.invalid}</p>
            </div>
            {result.duplicates > 0 && (
              <div>
                <p className="text-gray-600">🔄 Duplicates</p>
                <p className="text-lg font-semibold text-gray-600">{result.duplicates}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
