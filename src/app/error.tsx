'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    // Post error to logging API
    const logError = async () => {
      try {
        // Get user ID from localStorage or session if available
        let userId: string | undefined;
        try {
          const supabaseAuth = localStorage.getItem('supabase.auth.token');
          if (supabaseAuth) {
            const parsed = JSON.parse(supabaseAuth);
            userId = parsed?.currentSession?.user?.id;
          }
        } catch {
          // Ignore
        }

        await fetch('/api/log/error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: error.message || 'Unhandled error',
            stack: error.stack,
            userId,
            pathname,
            timestamp: new Date().toISOString(),
            userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
            errorBoundary: true,
          }),
        });
      } catch (logErr) {
        // Don't fail if logging fails
        console.error('Failed to log error:', logErr);
      }
    };

    logError();
  }, [error, pathname]);

  return (
    <html>
      <body>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Something went wrong
            </h1>
            <p className="text-gray-600 mb-6">
              We encountered an unexpected error. Our team has been notified.
            </p>
            <div className="space-y-3">
              <button
                onClick={reset}
                className="w-full inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Try again
              </button>
              <a
                href="/"
                className="w-full inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-colors"
              >
                Go home
              </a>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-8 text-left">
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
      </body>
    </html>
  );
}

