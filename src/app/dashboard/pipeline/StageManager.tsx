"use client"
import { useState } from 'react'

interface StageManagerProps {
  pipelineId: string
  onStageAdded: () => void
}

export default function StageManager({ pipelineId, onStageAdded }: StageManagerProps) {
  const [stageName, setStageName] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const addStage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stageName.trim()) return

    setIsAdding(true)
    try {
      const response = await fetch(`/api/pipeline/${pipelineId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: stageName.trim() })
      })

      if (response.ok) {
        setStageName('')
        onStageAdded()
      } else {
        const error = await response.json()
        console.error('Failed to add stage:', error)
      }
    } catch (error) {
      console.error('Error adding stage:', error)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-4 mb-6">
      <h3 className="text-lg font-semibold mb-3">Add Pipeline Stage</h3>
      <form onSubmit={addStage} className="flex gap-3">
        <input
          type="text"
          value={stageName}
          onChange={(e) => setStageName(e.target.value)}
          placeholder="Enter stage name..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isAdding}
        />
        <button
          type="submit"
          disabled={!stageName.trim() || isAdding}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAdding ? 'Adding...' : 'Add Stage'}
        </button>
      </form>
    </div>
  )
} 