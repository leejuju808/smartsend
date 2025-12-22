'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ValidatePage() {
  const [mappedRows, setMappedRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('import_preview')
    if (stored) {
      try {
        setMappedRows(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to parse stored data:', e)
      }
    }
  }, [])

  const handleImport = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/import-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: mappedRows,
          skipSuppressed: true,
        }),
      })
      
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Import failed')
      
      alert(`Successfully imported ${result.results?.inserted || 0} contacts!`)
      localStorage.removeItem('import_preview')
      window.location.href = '/dashboard/contacts'
    } catch (error: any) {
      alert(`Import failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const previewRows = mappedRows.slice(0, 10)

  return (
    <div className="max-w-4xl mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>📋 Import Preview (Step 3: Validate & Import)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Review your mapped data before importing. Showing first 10 rows of {mappedRows.length} total.
              </p>
              <div className="text-sm font-medium">
                Total contacts: {mappedRows.length}
              </div>
            </div>

            {mappedRows.length > 0 ? (
              <>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Email</th>
                        <th className="text-left px-3 py-2 font-medium">First Name</th>
                        <th className="text-left px-3 py-2 font-medium">Last Name</th>
                        <th className="text-left px-3 py-2 font-medium">Company</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2">{row.email || '-'}</td>
                          <td className="px-3 py-2">{row.first_name || '-'}</td>
                          <td className="px-3 py-2">{row.last_name || '-'}</td>
                          <td className="px-3 py-2">{row.company || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3">
                  <Button 
                    onClick={() => window.location.href = '/import'}
                    className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    ← Back to Mapping
                  </Button>
                  <Button 
                    onClick={handleImport}
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? 'Importing...' : `Import ${mappedRows.length} Contacts`}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No data found. Please go back to mapping.</p>
                <Button 
                  onClick={() => window.location.href = '/import'}
                  className="mt-4 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  ← Back to Mapping
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}