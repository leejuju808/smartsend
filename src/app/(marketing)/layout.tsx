export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex justify-between items-center border-b">
        <h1 className="text-xl font-bold">SmartSendAI</h1>
        <nav className="space-x-4 text-sm">
          <a href="/pricing" className="hover:underline">Pricing</a>
          <a href="/login" className="hover:underline">Login</a>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="px-6 py-4 border-t text-center text-xs text-gray-500">
        © {new Date().getFullYear()} SmartSendAI
      </footer>
    </div>
  );
} 