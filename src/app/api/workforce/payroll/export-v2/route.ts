// Block 256900 — Payroll & Timekeeping Engine v1
// GET /api/workforce/payroll/export-v2
// Export payroll to QuickBooks, Gusto, ADP, Paychex, or CSV

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const start_date = searchParams.get("start_date");
    const end_date = searchParams.get("end_date");
    const format = searchParams.get("format") || "csv"; // quickbooks, gusto, adp, paychex, csv

    if (!company_id || !start_date || !end_date) {
      return NextResponse.json(
        {
          error: "company_id, start_date, and end_date are required",
        },
        { status: 400 }
      );
    }

    if (!["quickbooks", "gusto", "adp", "paychex", "csv"].includes(format)) {
      return NextResponse.json(
        { error: "format must be one of: quickbooks, gusto, adp, paychex, csv" },
        { status: 400 }
      );
    }

    // Export based on format
    let exportData: any;

    if (format === "quickbooks") {
      const { data, error } = await supabase.rpc("export_payroll_quickbooks", {
        p_company_id: company_id,
        p_start_date: start_date,
        p_end_date: end_date,
      });

      if (error) {
        console.error("QuickBooks export error:", error);
        return NextResponse.json(
          { error: "Export failed", details: error.message },
          { status: 500 }
        );
      }

      exportData = data;
    } else if (format === "csv") {
      const { data, error } = await supabase.rpc("export_payroll_csv", {
        p_company_id: company_id,
        p_start_date: start_date,
        p_end_date: end_date,
      });

      if (error) {
        console.error("CSV export error:", error);
        return NextResponse.json(
          { error: "Export failed", details: error.message },
          { status: 500 }
        );
      }

      // Return CSV as text
      return new NextResponse(data, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="payroll_${start_date}_${end_date}.csv"`,
        },
      });
    } else {
      // For Gusto, ADP, Paychex - return JSON format (can be converted to their formats)
      const { data, error } = await supabase.rpc("export_payroll_quickbooks", {
        p_company_id: company_id,
        p_start_date: start_date,
        p_end_date: end_date,
      });

      if (error) {
        console.error("Export error:", error);
        return NextResponse.json(
          { error: "Export failed", details: error.message },
          { status: 500 }
        );
      }

      exportData = data;
    }

    // Create payroll period record
    const { data: payrollPeriod, error: periodError } = await supabase
      .from("payroll_periods")
      .insert({
        company_id,
        start_date,
        end_date,
        export_format: format,
        processed: true,
        processed_at: new Date().toISOString(),
        processed_by: user.id,
      })
      .select("*")
      .single();

    return NextResponse.json({
      success: true,
      format,
      data: exportData,
      payroll_period_id: payrollPeriod?.id,
      message: `Payroll exported successfully in ${format} format`,
    });
  } catch (error: any) {
    console.error("Error in payroll export API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















