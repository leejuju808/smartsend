import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "SmartSend AI",
    tagline: "The Cold Email Operating System for SMBs",
    description: "SmartSend AI is the first unified platform for importing leads, launching automated campaigns, and managing replies with AI. It's built with Next.js, Supabase, and Stripe, serving growing agencies and SaaS founders focused on speed-to-lead conversion.",
    founded: "2024",
    company: "AUREV Labs",
    website: "https://smartsendhq.com",
    demo: "https://smartsendhq.com/demo",
    assets: [
      { 
        title: "Logo Pack", 
        type: "zip",
        url: "/assets/smartsend-logo.zip",
        description: "SmartSend AI brand logos in multiple formats"
      },
      { 
        title: "Dashboard Screenshots", 
        type: "image",
        url: "/assets/screenshot-dashboard.png",
        description: "App screenshots showing dashboard and key features"
      },
      { 
        title: "Product Demo Video", 
        type: "video",
        url: "/videos/smartsend-demo.mp4",
        description: "Short demo clip showcasing SmartSend capabilities"
      },
      { 
        title: "Press Release", 
        type: "pdf",
        url: "/assets/press-release.pdf",
        description: "Official press release (PDF format)"
      },
      { 
        title: "Investor Deck", 
        type: "pdf",
        url: "/assets/investor-deck.pdf",
        description: "7-slide investor deck focused on traction and opportunity"
      }
    ],
    contact: {
      press: "press@smartsendhq.com",
      partnerships: "press@smartsendhq.com",
      investors: "press@smartsendhq.com"
    },
    keyFacts: {
      technology: ["Next.js", "Supabase", "Stripe", "OpenAI"],
      targetMarket: ["SMBs", "Agencies", "SaaS Founders"],
      headquarters: "San Francisco, CA"
    },
    social: {
      // Add social media links when available
      website: "https://smartsendhq.com",
      demo: "https://smartsendhq.com/demo"
    }
  });
}

