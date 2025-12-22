// Block 256100 — Digital Warranty Vault API
// GET /api/warranty/vault/[customerId]
// Returns all warranties for a customer (for customer portal)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = createClient();
    const { customerId } = await params;

    // For customer portal, we might not require authentication
    // or use a portal token instead
    const token = req.headers.get("x-portal-token");
    
    // TODO: Verify portal token if provided
    // For now, we'll allow access (you should add proper authentication)

    // Get all warranties for customer
    const { data: warranties, error: warrantiesError } = await supabase
      .from("warranties")
      .select(`
        *,
        job:jobs(id, title, address, completed_at)
      `)
      .eq("customer_id", customerId)
      .eq("is_active", true)
      .order("start_date", { ascending: false });

    if (warrantiesError) {
      console.error("Error fetching warranties:", warrantiesError);
      return NextResponse.json(
        { error: warrantiesError.message || "Failed to fetch warranties" },
        { status: 500 }
      );
    }

    // Get warranty claims for customer
    const { data: claims, error: claimsError } = await supabase
      .from("warranty_claims")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (claimsError) {
      console.error("Error fetching claims:", claimsError);
      // Don't fail if claims fail
    }

    // Format warranties for portal display
    const formattedWarranties = (warranties || []).map((w) => {
      const coverageDetails = w.coverage_details || {};
      const daysUntilExpiration = w.end_date 
        ? Math.max(0, Math.floor((new Date(w.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
        : null;

      return {
        id: w.id,
        type: w.warranty_type,
        type_display: w.warranty_type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        coverage_items: coverageDetails.coverage_items || [],
        exclusions: coverageDetails.exclusions || [],
        registration_number: coverageDetails.registration_number || null,
        manufacturer: coverageDetails.manufacturer || null,
        transferable: w.transferable,
        start_date: w.start_date,
        end_date: w.end_date,
        days_until_expiration: daysUntilExpiration,
        expires_soon: daysUntilExpiration !== null && daysUntilExpiration <= 90,
        job: w.job,
      };
    });

    return NextResponse.json({
      warranties: formattedWarranties,
      claims: claims || [],
      total_warranties: formattedWarranties.length,
      active_warranties: formattedWarranties.filter((w) => w.days_until_expiration === null || w.days_until_expiration > 0).length,
    });
  } catch (error: any) {
    console.error("Error in GET /api/warranty/vault/[customerId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















