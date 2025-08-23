import { supabaseAdmin } from "@/server/supabase";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ReferralPage({ params }: { params: { code: string } }) {
  const code = params.code;
  
  // Verify the referral code exists
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();

  if (!prof) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto">
          <span className="text-2xl">🎉</span>
        </div>
        
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome to SmartSendAI
          </h1>
          <p className="text-lg text-gray-600">
            You've been invited by a friend!
          </p>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-blue-800 font-medium">
            🎁 <strong>7 extra trial days</strong> thanks to your friend
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href={`/signup?ref=${code}`}
            className="w-full inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Claim Your Extended Trial
          </Link>
          
          <p className="text-sm text-gray-500">
            Already have an account?{" "}
            <Link href={`/login?ref=${code}`} className="text-blue-600 hover:underline">
              Sign in here
            </Link>
          </p>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="hover:underline">Terms of Service</Link>{" "}
            and{" "}
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
} 