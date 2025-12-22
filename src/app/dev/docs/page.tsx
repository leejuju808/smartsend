import Link from 'next/link';
import { BookOpen, Code2, Key, Zap } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/dev" className="text-gray-400 hover:text-white mb-2 inline-block">
                ← Back to Developer Portal
              </Link>
              <div className="flex items-center gap-3">
                <BookOpen className="h-8 w-8 text-yellow-400" />
                <h1 className="text-3xl font-bold">Documentation</h1>
              </div>
              <p className="mt-2 text-gray-400">
                API reference and integration guides for AUREV HQ
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Getting Started */}
          <Link href="/dev/docs/getting-started" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all h-full">
              <Zap className="h-10 w-10 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">Getting Started</h3>
              <p className="text-gray-400 text-sm">
                Quick setup guide to build your first extension
              </p>
            </div>
          </Link>

          {/* API Reference */}
          <Link href="/dev/docs/api-reference" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all h-full">
              <Code2 className="h-10 w-10 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">API Reference</h3>
              <p className="text-gray-400 text-sm">
                Complete REST API documentation and examples
              </p>
            </div>
          </Link>

          {/* Authentication */}
          <Link href="/dev/docs/auth" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all h-full">
              <Key className="h-10 w-10 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">Authentication</h3>
              <p className="text-gray-400 text-sm">
                JWT and API key authentication flows
              </p>
            </div>
          </Link>

          {/* SDKs */}
          <Link href="/dev/docs/sdks" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all h-full">
              <Code2 className="h-10 w-10 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">SDKs</h3>
              <p className="text-gray-400 text-sm">
                Node.js and Python SDK documentation
              </p>
            </div>
          </Link>
        </div>

        {/* Quick Links */}
        <div className="mt-12 bg-gradient-to-br from-yellow-900/20 to-yellow-800/20 border border-yellow-500/20 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Quick Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-bold mb-2">Base URL</h4>
              <code className="bg-black/50 px-3 py-2 rounded text-yellow-400">
                /api/hq/v1
              </code>
            </div>
            <div>
              <h4 className="font-bold mb-2">Rate Limit</h4>
              <p className="text-gray-400">100 requests/minute</p>
            </div>
            <div>
              <h4 className="font-bold mb-2">Support</h4>
              <a href="#" className="text-yellow-400 hover:text-yellow-300">
                Contact us →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

