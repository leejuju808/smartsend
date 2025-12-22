// Block 140000 — SmartSend Roofing Website Widget
// Public endpoint: /api/widget/script.js?ss_cmp=COMPANY_ID
// Returns embeddable JavaScript that loads the widget on any website

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("ss_cmp");

  if (!companyId) {
    return new NextResponse(
      "// SmartSend Widget: Missing company_id parameter (ss_cmp)",
      {
        status: 400,
        headers: { "Content-Type": "application/javascript" },
      }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com";
  const widgetUrl = `${siteUrl}/widget/frame?company_id=${companyId}`;

  // Generate the widget JavaScript
  const widgetScript = `(function() {
  // Read company_id from script tag URL parameter
  const scriptTag = document.currentScript || document.querySelector('script[src*="widget/script.js"]');
  const scriptUrl = scriptTag ? scriptTag.src : '';
  const urlParams = new URLSearchParams(scriptUrl.split('?')[1] || '');
  const companyId = urlParams.get("ss_cmp") || "${companyId}";
  
  if (!companyId) {
    console.error("SmartSend Widget: Missing ss_cmp parameter");
    return;
  }
  
  const w = window;
  
  // Prevent double-loading
  if (w.SmartSendWidgetLoaded) return;
  w.SmartSendWidgetLoaded = true;
  
  function loadWidget() {
    // Create chat bubble button
    const bubble = document.createElement("div");
    bubble.id = "smartsend-widget-bubble";
    bubble.innerText = "💬 Roof Help";
    bubble.style.cssText = \`
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background: #F97316;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999998;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 24px;
      transition: transform 0.2s;
    \`;
    
    bubble.onmouseenter = () => {
      bubble.style.transform = "scale(1.1)";
    };
    bubble.onmouseleave = () => {
      bubble.style.transform = "scale(1)";
    };
    
    // Create iframe container
    const container = document.createElement("div");
    container.id = "smartsend-widget-container";
    container.style.cssText = \`
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 360px;
      height: 600px;
      border: none;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      z-index: 999999;
      display: none;
      overflow: hidden;
      background: #fff;
    \`;
    
    const iframe = document.createElement("iframe");
    iframe.src = "${widgetUrl}";
    iframe.style.cssText = \`
      width: 100%;
      height: 100%;
      border: none;
    \`;
    container.appendChild(iframe);
    
    let isOpen = false;
    
    bubble.onclick = () => {
      isOpen = !isOpen;
      if (isOpen) {
        container.style.display = "block";
        bubble.style.display = "none";
      } else {
        container.style.display = "none";
        bubble.style.display = "flex";
      }
    };
    
    // Close on outside click (optional)
    document.addEventListener("click", (e) => {
      if (isOpen && !container.contains(e.target) && e.target !== bubble) {
        isOpen = false;
        container.style.display = "none";
        bubble.style.display = "flex";
      }
    });
    
    // Listen for close message from iframe
    window.addEventListener("message", (e) => {
      if (e.data === "smartsend-widget-close") {
        isOpen = false;
        container.style.display = "none";
        bubble.style.display = "flex";
      }
    });
    
    document.body.appendChild(bubble);
    document.body.appendChild(container);
  }
  
  // Load when DOM is ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    loadWidget();
  } else {
    window.addEventListener("load", loadWidget);
  }
})();`;

  return new NextResponse(widgetScript, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    },
  });
}


























