// Block 19900 — Landing Page Generation
// GET /api/lead-capture/landing-page/[slug]
// Returns landing page HTML/content

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get landing page configuration
    const { data: landingPage, error: pageError } = await supabase
      .from("landing_pages")
      .select("*, form_id, lead_capture_forms(*)")
      .eq("workspace_id", workspaceId)
      .eq("page_slug", slug)
      .eq("is_active", true)
      .single();

    if (pageError || !landingPage) {
      return NextResponse.json(
        { error: "Landing page not found" },
        { status: 404 }
      );
    }

    // Get workspace info for branding
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .single();

    const content = landingPage.content_config as any;
    const formConfig = landingPage.lead_capture_forms as any;

    // Generate HTML (simplified version - you can use a proper template engine)
    const html = generateLandingPageHTML({
      headline: content.headline || "Free Roof Estimate",
      subheadline: content.subheadline || "Get your free roof inspection today",
      companyName: workspace?.name || "Roofing Solutions",
      logoUrl: content.company_logo_url,
      heroImageUrl: content.hero_image_url,
      callNowButton: content.call_now_button,
      formConfig: formConfig,
      testimonials: content.testimonials || [],
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error: any) {
    console.error("Error generating landing page:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Generate landing page HTML
function generateLandingPageHTML(params: {
  headline: string;
  subheadline: string;
  companyName: string;
  logoUrl?: string;
  heroImageUrl?: string;
  callNowButton?: { enabled: boolean; phone?: string };
  formConfig?: any;
  testimonials: any[];
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.headline} - ${params.companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      text-align: center;
      padding: 40px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    header p {
      font-size: 1.2em;
      opacity: 0.9;
    }
    .hero-image {
      width: 100%;
      max-height: 400px;
      object-fit: cover;
      margin: 20px 0;
    }
    .form-section {
      background: #f8f9fa;
      padding: 40px;
      border-radius: 8px;
      margin: 40px 0;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 600;
    }
    input, textarea, select {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 16px;
    }
    button {
      background: #667eea;
      color: white;
      padding: 14px 28px;
      border: none;
      border-radius: 4px;
      font-size: 18px;
      cursor: pointer;
      width: 100%;
    }
    button:hover {
      background: #5568d3;
    }
    .call-button {
      background: #28a745;
      margin: 20px 0;
    }
    .call-button:hover {
      background: #218838;
    }
    .testimonials {
      margin: 40px 0;
    }
    .testimonial {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <header>
    ${params.logoUrl ? `<img src="${params.logoUrl}" alt="${params.companyName}" style="max-height: 80px; margin-bottom: 20px;">` : ''}
    <h1>${params.headline}</h1>
    <p>${params.subheadline}</p>
  </header>

  <div class="container">
    ${params.heroImageUrl ? `<img src="${params.heroImageUrl}" alt="Roofing" class="hero-image">` : ''}

    ${params.callNowButton?.enabled && params.callNowButton?.phone ? `
      <a href="tel:${params.callNowButton.phone}" class="call-button" style="display: block; text-align: center; text-decoration: none; padding: 14px 28px; background: #28a745; color: white; border-radius: 4px; font-size: 18px; margin: 20px 0;">
        Call Now: ${params.callNowButton.phone}
      </a>
    ` : ''}

    <div class="form-section">
      <h2>Get Your Free Estimate</h2>
      <form id="leadForm" onsubmit="submitForm(event)">
        <div class="form-group">
          <label for="name">Name *</label>
          <input type="text" id="name" name="name" required>
        </div>
        <div class="form-group">
          <label for="email">Email *</label>
          <input type="email" id="email" name="email" required>
        </div>
        <div class="form-group">
          <label for="phone">Phone *</label>
          <input type="tel" id="phone" name="phone" required>
        </div>
        <div class="form-group">
          <label for="address">Address</label>
          <input type="text" id="address" name="address">
        </div>
        <div class="form-group">
          <label for="job_type">Job Type</label>
          <select id="job_type" name="job_type">
            <option value="">Select...</option>
            <option value="Roof Repair">Roof Repair</option>
            <option value="Roof Replacement">Roof Replacement</option>
            <option value="Inspection">Inspection</option>
            <option value="Gutters">Gutters</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="4"></textarea>
        </div>
        <button type="submit">Submit</button>
      </form>
    </div>

    ${params.testimonials.length > 0 ? `
      <div class="testimonials">
        <h2>What Our Customers Say</h2>
        ${params.testimonials.map((t: any) => `
          <div class="testimonial">
            <p>"${t.text}"</p>
            <p><strong>- ${t.author}</strong></p>
          </div>
        `).join('')}
      </div>
    ` : ''}
  </div>

  <script>
    async function submitForm(event) {
      event.preventDefault();
      const form = event.target;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      const workspaceId = new URLSearchParams(window.location.search).get('workspace_id');
      const formSlug = 'lead'; // Default form slug

      try {
        const response = await fetch('/api/lead-capture/form-submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_slug: formSlug,
            workspace_id: workspaceId,
            submission_data: data
          })
        });

        if (response.ok) {
          alert('Thank you! We\'ll be in touch soon.');
          form.reset();
        } else {
          alert('Something went wrong. Please try again.');
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
      }
    }
  </script>
</body>
</html>
  `.trim();
}



















































