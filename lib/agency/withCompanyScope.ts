import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Middleware to enforce company scope for agency users
 * Ensures agency users can only access data for companies they manage
 */
export async function requireCompanyScope(
  req: NextRequest,
  companyId?: string
): Promise<
  | { error: NextResponse }
  | { company_id: string; agency_id: string | null; user: any }
> {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Get company ID from query params, headers, or body
  const activeCompanyId =
    companyId ||
    req.nextUrl.searchParams.get("company_id") ||
    req.headers.get("x-company-id");

  if (!activeCompanyId) {
    // Check if user is in agency mode (no company selected)
    const { data: agencies } = await supabase.rpc("get_user_agencies", {
      p_user_id: user.id,
    });

    if (agencies && agencies.length > 0) {
      // User is in agency mode - allow access to agency dashboard
      return {
        company_id: "",
        agency_id: agencies[0].agency_id,
        user,
      };
    }

    return {
      error: NextResponse.json(
        { error: "Missing company_id" },
        { status: 400 }
      ),
    };
  }

  // Check if user has access to this company via agency
  const { data: hasAccess, error: accessError } = await supabase.rpc(
    "has_agency_company_access",
    {
      p_company_id: activeCompanyId,
      p_user_id: user.id,
    }
  );

  if (accessError || !hasAccess) {
    // Also check if user is direct owner of the company
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("owner_id")
      .eq("id", activeCompanyId)
      .single();

    if (company?.owner_id === user.id) {
      // User is direct owner - allow access
      return {
        company_id: activeCompanyId,
        agency_id: null,
        user,
      };
    }

    return {
      error: NextResponse.json(
        { error: "Forbidden: No access to this company" },
        { status: 403 }
      ),
    };
  }

  // Get agency ID for this company
  const { data: agencyCompany } = await supabase
    .from("agency_companies")
    .select("agency_id")
    .eq("company_id", activeCompanyId)
    .single();

  return {
    company_id: activeCompanyId,
    agency_id: agencyCompany?.agency_id || null,
    user,
  };
}

/**
 * Wrapper for API routes that require company scope
 */
export function withCompanyScope(
  handler: (
    req: NextRequest,
    context: { company_id: string; agency_id: string | null; user: any }
  ) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const scope = await requireCompanyScope(req);
    if ("error" in scope) {
      return scope.error;
    }
    return handler(req, scope);
  };
}

/**
 * Get active company ID from cookie/localStorage (client-side)
 */
export function getActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("active_company_id");
}

/**
 * Set active company ID (client-side)
 */
export function setActiveCompanyId(companyId: string | null): void {
  if (typeof window === "undefined") return;
  if (companyId) {
    localStorage.setItem("active_company_id", companyId);
    document.cookie = `active_company_id=${companyId}; path=/; max-age=31536000`;
  } else {
    localStorage.removeItem("active_company_id");
    document.cookie = `active_company_id=; path=/; max-age=0`;
  }
}



























