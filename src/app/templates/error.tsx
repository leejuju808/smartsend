'use client';

export default function TemplatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Something went wrong
          </h1>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            We encountered an error while loading the template marketplace. 
            Please try again or contact support if the problem persists.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={reset}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors mr-3"
            >
              Try again
            </button>
            
            <a
              href="/"
              className="inline-flex items-center px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-colors"
            >
              Go home
            </a>
          </div>
          
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-8 text-left max-w-2xl mx-auto">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Error details (development only)
              </summary>
              <pre className="mt-2 p-4 bg-gray-100 rounded text-xs text-gray-800 overflow-auto">
                {error.message}
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
} 