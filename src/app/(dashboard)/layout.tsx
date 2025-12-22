import { ReactNode } from 'react'
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { UpgradeNudge } from "@/components/UpgradeNudge";
import { GlobalSearch } from "@/components/global-search";

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  return (
    <div>
      <GlobalSearch />
      {userId && <UpgradeNudge userId={userId} />}
      {children}
    </div>
  );
}
