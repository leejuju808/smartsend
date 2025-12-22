import Link from "next/link";
import { Zap } from "lucide-react";
import { Poppins } from "next/font/google";
import { redirect } from "next/navigation";
import { isSalesModeEnabled } from "@/lib/feature-flags";

const poppins = Poppins({ 
  weight: ['400', '500', '600', '700', '800'], 
  subsets: ['latin'],
  variable: '--font-poppins'
});

export default function ComingSoonPage() {
  // BLOCK 281000 — Sales Mode: hide "coming soon" pages.
  if (isSalesModeEnabled()) {
    redirect("/");
  }

  return (
    <div className={`min-h-screen bg-white flex flex-col items-center justify-center px-4 ${poppins.variable}`} style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="max-w-2xl text-center">
        {/* Logo/Header */}
        <div className="flex items-center justify-center mb-8">
          <Zap className="h-10 w-10" style={{ color: '#FFD700' }} />
          <h1 className={`text-4xl font-bold ml-3 ${poppins.className}`} style={{ color: '#000000' }}>
            SmartSend HQ
          </h1>
        </div>
        
        {/* Coming Soon subtitle */}
        <p className={`text-2xl font-semibold mb-12 ${poppins.className}`} style={{ color: '#000000' }}>
          Coming Soon
        </p>
        
        {/* Main content */}
        <div className="space-y-6 mb-16">
          <h2 className={`text-3xl font-bold ${poppins.className}`} style={{ color: '#000000' }}>
            SmartSend HQ — Send Smarter. Close Faster.
          </h2>
          
          <p className="text-lg" style={{ color: '#000000' }}>
            We're building an automation-first outbound engine for founders and small teams.
            <br />
            Join early to get templates, AI-powered send windows, and your first 200 leads free.
          </p>
          
          <div className="space-y-4 pt-8">
            <p className="text-lg">
              → Follow updates on X: <a href="https://x.com/SmartSendAI" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80" style={{ color: '#000000' }}>@SmartSendAI</a>
            </p>
            <p className="text-lg">
              → Join the waitlist: (your form link coming soon)
            </p>
          </div>
        </div>
        
        {/* Brand notes */}
        <div className="border-t pt-8 mt-8" style={{ borderColor: '#000000' }}>
          <p className={`text-sm font-semibold mb-4 ${poppins.className}`} style={{ color: '#000000' }}>
            Brand Notes
          </p>
          <div className="text-sm space-y-2 text-left" style={{ color: '#000000' }}>
            <p>• Colors: #000000 (Black), #FFD700 (Gold), #FFFFFF (White)</p>
            <p>• Fonts: Poppins (headers), Inter (body)</p>
            <p>• Vibe: Bold • Clean • Fast ⚡</p>
          </div>
        </div>
        
        {/* Navigation */}
        <div className="mt-12">
          <Link 
            href="/" 
            className="text-sm hover:underline"
            style={{ color: '#000000' }}
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
