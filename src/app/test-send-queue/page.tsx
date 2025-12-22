"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import SendQueue from "@/components/dashboard/SendQueue";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SendQueueTestPage() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    company: "",
    subject: "",
    body: "",
    scheduledFor: ""
  });

  const addToQueue = async () => {
    if (!formData.email || !formData.subject || !formData.body) {
      alert("Please fill in email, subject, and body");
      return;
    }

    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please log in first");
        return;
      }

      // Create a test campaign first
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          name: "Test Campaign",
          subject: formData.subject,
          body_html: formData.body,
          body_text: formData.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
          from_email: user.email || "test@example.com",
          from_name: "Test Sender",
          status: "active"
        })
        .select()
        .single();

      if (campaignError) {
        console.error("Error creating campaign:", campaignError);
        alert("Error creating campaign");
        return;
      }

      // Add to send queue
      const scheduledFor = formData.scheduledFor || new Date().toISOString();
      
      const { data: queueItem, error: queueError } = await supabase
        .from("send_queue")
        .insert({
          campaign_id: campaign.id,
          user_id: user.id,
          email_lower: formData.email.toLowerCase(),
          name: formData.name || null,
          company: formData.company || null,
          custom_fields: {},
          status: "pending",
          scheduled_for: scheduledFor,
          attempts: 0,
          max_attempts: 3
        })
        .select()
        .single();

      if (queueError) {
        console.error("Error adding to queue:", queueError);
        alert("Error adding to queue");
        return;
      }

      alert("Email added to queue successfully!");
      
      // Reset form
      setFormData({
        email: "",
        name: "",
        company: "",
        subject: "",
        body: "",
        scheduledFor: ""
      });

    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Send Queue Module Test</h1>
        <p className="text-gray-600 mt-2">Test the real-time email sending queue functionality</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Add to Queue Form */}
        <Card>
          <CardHeader>
            <CardTitle>Add Email to Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="recipient@example.com"
              />
            </div>

            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="John Doe"
              />
            </div>

            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                placeholder="Acme Corp"
              />
            </div>

            <div>
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Hello {{first_name}}!"
              />
            </div>

            <div>
              <Label htmlFor="body">Email Body *</Label>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Hi {{first_name}},<br><br>I hope this email finds you well at {{company}}.<br><br>Best regards,<br>Sender"
                rows={6}
              />
            </div>

            <div>
              <Label htmlFor="scheduledFor">Schedule For (optional)</Label>
              <Input
                id="scheduledFor"
                type="datetime-local"
                value={formData.scheduledFor}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledFor: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to send immediately
              </p>
            </div>

            <Button 
              onClick={addToQueue} 
              disabled={loading}
              className="w-full"
            >
              {loading ? "Adding to Queue..." : "Add to Send Queue"}
            </Button>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1. Add Test Emails</h3>
              <p className="text-sm text-gray-600">
                Use the form to add emails to the send queue. You can use personalization variables like:
              </p>
              <ul className="text-xs text-gray-500 mt-1 ml-4">
                <li>• {{first_name}} - First name</li>
                <li>• {{name}} - Full name</li>
                <li>• {{company}} - Company name</li>
                <li>• {{email}} - Email address</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">2. Monitor Queue</h3>
              <p className="text-sm text-gray-600">
                The Send Queue component will show real-time updates as emails are processed.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">3. Execute Sends</h3>
              <p className="text-sm text-gray-600">
                Click "Send Now" on pending emails to execute them immediately, or wait for the scheduled time.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">4. Real-time Updates</h3>
              <p className="text-sm text-gray-600">
                The queue updates in real-time using Supabase real-time subscriptions.
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> The current implementation logs emails to console. 
                Replace the SMTP implementation in the Edge Function with your actual email service.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Send Queue Component */}
      <SendQueue />
    </div>
  );
}