import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="px-6 py-4 flex justify-between items-center border-b bg-white">
        <Link href="/" className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">SmartSend</h1>
          <span className="text-xs text-gray-500">AI</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/features" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
            Features
          </Link>
          <Link href="/pricing" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
            Pricing
          </Link>
          <Link href="/demo" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
            Demo
          </Link>
          <Link href="/founder-letter" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
            Founder Letter
          </Link>
          <Link href="/login" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
            Login
          </Link>
          <Link href="/signup" className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors font-medium">
            Sign Up
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="px-6 py-8 border-t text-center text-sm text-gray-600 bg-gray-50">
        <div className="space-y-2">
          <div>
            © {new Date().getFullYear()} SmartSend AI. Built ONLY for roofing companies.
          </div>
          <div className="flex justify-center gap-4 text-xs">
            <Link href="/legal/privacy" className="hover:text-gray-900 transition-colors">Privacy</Link>
            <span className="text-gray-400">|</span>
            <Link href="/legal/terms" className="hover:text-gray-900 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
} 