'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, Home } from 'lucide-react'

export default function Error500({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('500 error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Something went wrong
        </h1>
        <p className="text-gray-600 mb-8">
          We encountered an unexpected error. Our team has been notified and is working on a fix.
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full inline-flex items-center justify-center px-6 py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Link>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-8 text-left bg-gray-100 p-4 rounded-lg">
            <summary className="cursor-pointer text-sm text-gray-700 font-medium mb-2">
              Error details (development only)
            </summary>
            <pre className="text-xs text-gray-600 overflow-auto">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

