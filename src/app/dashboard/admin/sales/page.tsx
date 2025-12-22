import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SalesOpsPanel } from "@/components/sales/SalesOpsPanel";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

export default async function AdminSalesModePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  const jar = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return jar.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-600 mt-2">Your email is not in ADMIN_EMAILS.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales Mode (v1 Freeze)</h1>
        <p className="text-sm text-gray-600 mt-2">Stop building. Start selling.</p>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <div className="text-sm font-semibold text-gray-900 mb-2">What SmartSend Does</div>
        <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-900 leading-relaxed">
          SmartSend helps roofing companies book more high-paying jobs by sending estimates faster, following up
          automatically, and proving ROI in one dashboard.
        </div>
        <div className="text-xs text-gray-500 mt-2">Locked sales script (admin-only).</div>
      </div>

      <SalesOpsPanel />
    </div>
  );
}









