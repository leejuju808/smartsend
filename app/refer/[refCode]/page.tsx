"use client";

// Block 84000 — Referral Landing Page
// Public page where referred homeowners can submit their info

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

interface ReferralData {
  referralLink: {
    id: string;
    ref_code: string;
    homeowner_portals: {
      roofing_jobs: {
        title: string;
        leads: {
          first_name: string;
          last_name: string;
        };
      };
    };
  };
  photos: Array<{
    id: string;
    photo_url: string;
    photo_type: string;
  }>;
}

export default function ReferralLandingPage() {
  const params = useParams();
  const refCode = params.refCode as string;
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/referrals/${refCode}`);
        
        if (!response.ok) {
          throw new Error("Referral link not found");
        }

        const result = await response.json();
        setData(result);

        // Track click
        await fetch(`/api/referrals/${refCode}/track-click`, {
          method: "POST",
        });
      } catch (error: any) {
        console.error("Error fetching referral data:", error);
        toast.error("Invalid referral link");
      } finally {
        setLoading(false);
      }
    };

    if (refCode) {
      fetchData();
    }
  }, [refCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!data?.referralLink) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/referrals/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referralId: data.referralLink.id,
          homeownerName: formData.name,
          homeownerEmail: formData.email,
          homeownerPhone: formData.phone,
          message: formData.message,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit referral");
      }

      setSubmitted(true);
      toast.success("Thank you! We'll be in touch soon.");
    } catch (error: any) {
      console.error("Error submitting referral:", error);
      toast.error("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">
              Invalid referral link. Please check the link and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const referrerName = data.referralLink.homeowner_portals.roofing_jobs.leads
    ? `${data.referralLink.homeowner_portals.roofing_jobs.leads.first_name} ${data.referralLink.homeowner_portals.roofing_jobs.leads.last_name}`
    : "a friend";

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">Thank You!</h2>
            <p className="text-gray-600">
              We've received your information and will be in touch soon to schedule your free roof inspection.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              You were referred by {referrerName}
            </CardTitle>
            <p className="text-gray-600 mt-2">
              {referrerName} recently had their roof replaced and thought you might benefit from the same quality service.
            </p>
          </CardHeader>
        </Card>

        {/* Photo Gallery */}
        {data.photos && data.photos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Work</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {data.photos.slice(0, 6).map((photo) => (
                  <div
                    key={photo.id}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-200"
                  >
                    <img
                      src={photo.photo_url}
                      alt="Roofing work"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact Form */}
        <Card>
          <CardHeader>
            <CardTitle>Get Your Free Roof Inspection</CardTitle>
            <p className="text-sm text-gray-600">
              Fill out the form below and we'll contact you to schedule a free inspection.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="message">Message (Optional)</Label>
                <Textarea
                  id="message"
                  rows={4}
                  value={formData.message}
                  onChange={(e) =>
                    setFormData({ ...formData, message: e.target.value })
                  }
                  placeholder="Tell us about your roofing needs..."
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Book Your Free Inspection"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Trust Badges */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">Free</div>
                <div className="text-sm text-gray-600">Inspection</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">Licensed</div>
                <div className="text-sm text-gray-600">& Insured</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">Warranty</div>
                <div className="text-sm text-gray-600">Protected</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



























