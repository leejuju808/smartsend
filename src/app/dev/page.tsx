import { redirect } from 'next/navigation';
import { getUserWithSubscription } from '@/lib/getUserWithSubscription';
import Link from 'next/link';
import { 
  BookOpen, 
  Code2, 
  Key, 
  TrendingUp, 
  Package, 
  Zap,
  BarChart3,
  DollarSign
} from 'lucide-react';

export default async function DevPortalPage() {
  const { user, isPro } = await getUserWithSubscription();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 bg-clip-text text-transparent">
                AUREV HQ Developer Platform
              </h1>
              <p className="mt-2 text-gray-400">
                Build, deploy, and monetize extensions across SmartSend ⚡ OpsGrid 🧩 Agent Cloud 🤖
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <Key className="h-8 w-8 text-yellow-400" />
              <span className="text-2xl font-bold">0</span>
            </div>
            <p className="text-gray-400 text-sm">API Keys</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <Package className="h-8 w-8 text-yellow-400" />
              <span className="text-2xl font-bold">0</span>
            </div>
            <p className="text-gray-400 text-sm">Extensions</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-yellow-400" />
              <span className="text-2xl font-bold">0</span>
            </div>
            <p className="text-gray-400 text-sm">Installs</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="h-8 w-8 text-yellow-400" />
              <span className="text-2xl font-bold">$0</span>
            </div>
            <p className="text-gray-400 text-sm">Earnings</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* API Keys */}
          <Link href="/dev/keys" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all">
              <Key className="h-12 w-12 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">API Keys</h3>
              <p className="text-gray-400 text-sm">
                Generate and manage API keys for your integrations
              </p>
            </div>
          </Link>

          {/* Extensions */}
          <Link href="/dev/extensions" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all">
              <Package className="h-12 w-12 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">Extensions</h3>
              <p className="text-gray-400 text-sm">
                Build and publish extensions to the marketplace
              </p>
            </div>
          </Link>

          {/* Documentation */}
          <Link href="/dev/docs" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all">
              <BookOpen className="h-12 w-12 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">Documentation</h3>
              <p className="text-gray-400 text-sm">
                API reference and integration guides
              </p>
            </div>
          </Link>

          {/* SDK */}
          <Link href="/dev/sdk" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all">
              <Code2 className="h-12 w-12 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">SDK</h3>
              <p className="text-gray-400 text-sm">
                Download Node.js and Python SDKs
              </p>
            </div>
          </Link>

          {/* Analytics */}
          <Link href="/dev/analytics" className="group">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 hover:border-yellow-500 transition-all">
              <BarChart3 className="h-12 w-12 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">Analytics</h3>
              <p className="text-gray-400 text-sm">
                Track usage, installs, and revenue
              </p>
            </div>
          </Link>

          {/* Getting Started */}
          <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/20 border border-yellow-500/20 rounded-lg p-8">
            <Zap className="h-12 w-12 text-yellow-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Getting Started</h3>
            <p className="text-gray-400 text-sm mb-4">
              New to the platform? Start building your first extension
            </p>
            <Link 
              href="/dev/docs/getting-started"
              className="inline-block px-4 py-2 bg-yellow-500 text-black rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              Start Building
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-12 bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Recent Activity</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-800">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                <span className="text-gray-300">Welcome to AUREV HQ Developer Platform</span>
              </div>
              <span className="text-gray-500 text-sm">Just now</span>
            </div>
            <div className="text-center py-8 text-gray-500">
              No activity yet. Start by creating an API key or building your first extension.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

