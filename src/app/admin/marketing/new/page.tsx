"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

export default function NewMarketingPostPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: "thread" as "thread" | "video" | "email",
    title: "",
    content: "",
    status: "draft" as "draft" | "scheduled",
    publish_date: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        type: formData.type,
        content: formData.content,
        title: formData.title || null,
        status: formData.status,
      };

      if (formData.status === "scheduled") {
        if (!formData.publish_date) {
          setError("Publish date is required when status is 'scheduled'");
          setLoading(false);
          return;
        }
        payload.publish_date = new Date(formData.publish_date).toISOString();
      }

      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create post");
      }

      const data = await res.json();
      router.push(`/admin/marketing/${data.post.id}`);
    } catch (err) {
      console.error("Error creating post:", err);
      setError(err instanceof Error ? err.message : "Failed to create post");
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/marketing"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Marketing Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Create New Marketing Post</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schedule content for Twitter threads, video uploads, or email broadcasts
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Post Type */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium mb-2">
              Post Type *
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="thread">🐦 Twitter/X Thread</option>
              <option value="video">🎥 Video/Demo Clip</option>
              <option value="email">📧 Email Broadcast</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {formData.type === "thread" && "Post a thread to X/Twitter"}
              {formData.type === "video" && "Schedule a video upload (manual upload required)"}
              {formData.type === "email" && "Send email to waitlist and active users"}
            </p>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              Title {formData.type === "email" && "*"}
            </label>
            <Input
              id="title"
              name="title"
              type="text"
              value={formData.title}
              onChange={handleChange}
              placeholder={
                formData.type === "thread"
                  ? "Thread title (optional)"
                  : formData.type === "email"
                  ? "Email subject line"
                  : "Video title (optional)"
              }
              required={formData.type === "email"}
            />
          </div>

          {/* Content */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium mb-2">
              Content *
            </label>
            <Textarea
              id="content"
              name="content"
              value={formData.content}
              onChange={handleChange}
              placeholder={
                formData.type === "thread"
                  ? "Enter your Twitter thread content..."
                  : formData.type === "email"
                  ? "Enter your email content (HTML supported)..."
                  : "Enter video description or notes..."
              }
              rows={formData.type === "email" ? 12 : 8}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formData.type === "email" && "HTML is supported for email content"}
            </p>
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium mb-2">
              Status *
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>

          {/* Publish Date (if scheduled) */}
          {formData.status === "scheduled" && (
            <div>
              <label htmlFor="publish_date" className="block text-sm font-medium mb-2">
                Publish Date & Time *
              </label>
              <Input
                id="publish_date"
                name="publish_date"
                type="datetime-local"
                value={formData.publish_date}
                onChange={handleChange}
                required={formData.status === "scheduled"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                The marketing-publisher function will automatically publish this at the scheduled time
              </p>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Post"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      {/* Help Text */}
      <Card className="p-4 mt-6 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-sm mb-2">💡 How it works:</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>
            <strong>Draft:</strong> Save as draft to edit later
          </li>
          <li>
            <strong>Scheduled:</strong> Post will be automatically published at the scheduled time
          </li>
          <li>
            <strong>Thread:</strong> Requires X_BEARER_TOKEN to be configured in edge function
          </li>
          <li>
            <strong>Email:</strong> Sends to all waitlist emails and active users automatically
          </li>
          <li>
            <strong>Video:</strong> Marked as published when you manually upload
          </li>
        </ul>
      </Card>
    </div>
  );
}

