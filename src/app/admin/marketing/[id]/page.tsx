"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

interface MarketingPost {
  id: string;
  type: "thread" | "video" | "email";
  title: string | null;
  content: string;
  status: "draft" | "scheduled" | "published" | "failed";
  publish_date: string | null;
  metrics: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export default function MarketingPostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<MarketingPost | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    status: "draft" as string,
    publish_date: "",
  });

  useEffect(() => {
    if (params.id) {
      fetchPost();
    }
  }, [params.id]);

  const fetchPost = async () => {
    try {
      const res = await fetch(`/api/marketing/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setPost(data.post);
        setFormData({
          title: data.post.title || "",
          content: data.post.content,
          status: data.post.status,
          publish_date: data.post.publish_date
            ? new Date(data.post.publish_date).toISOString().slice(0, 16)
            : "",
        });
      } else {
        setError("Post not found");
      }
    } catch (err) {
      console.error("Error fetching post:", err);
      setError("Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!post) return;
    setSaving(true);
    setError(null);

    try {
      const updates: any = {
        title: formData.title || null,
        content: formData.content,
        status: formData.status,
      };

      if (formData.status === "scheduled" && formData.publish_date) {
        updates.publish_date = new Date(formData.publish_date).toISOString();
      }

      const res = await fetch(`/api/marketing/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update post");
      }

      const data = await res.json();
      setPost(data.post);
      setEditMode(false);
      await fetchPost();
    } catch (err) {
      console.error("Error updating post:", err);
      setError(err instanceof Error ? err.message : "Failed to update post");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!post || !confirm("Are you sure you want to delete this post?")) return;

    try {
      const res = await fetch(`/api/marketing/${post.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete post");
      }

      router.push("/admin/marketing");
    } catch (err) {
      console.error("Error deleting post:", err);
      setError(err instanceof Error ? err.message : "Failed to delete post");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading post...</div>
      </div>
    );
  }

  if (error && !post) {
    return (
      <div className="p-6">
        <div className="text-lg text-red-600">{error}</div>
        <Button onClick={() => router.push("/admin/marketing")} className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!post) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800",
      scheduled: "bg-blue-100 text-blue-800",
      published: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-3 py-1 rounded-full text-sm font-medium ${
          colors[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status}
      </span>
    );
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "thread":
        return "🐦 Twitter/X Thread";
      case "video":
        return "🎥 Video/Demo";
      case "email":
        return "📧 Email Broadcast";
      default:
        return type;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/marketing"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Marketing Dashboard
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold">{post.title || `Untitled ${post.type}`}</h1>
            <div className="flex items-center gap-3 mt-2">
              {getStatusBadge(post.status)}
              <span className="text-sm text-muted-foreground">{getTypeLabel(post.type)}</span>
            </div>
          </div>
          {!editMode && post.status !== "published" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditMode(true)}>
                Edit
              </Button>
              <Button variant="outline" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {editMode ? (
        <Card className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Post title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Content</label>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={12}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              {post.status === "published" && <option value="published">Published</option>}
            </select>
          </div>

          {formData.status === "scheduled" && (
            <div>
              <label className="block text-sm font-medium mb-2">Publish Date & Time</label>
              <Input
                type="datetime-local"
                value={formData.publish_date}
                onChange={(e) => setFormData({ ...formData, publish_date: e.target.value })}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => setEditMode(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-6 mb-6">
            <h2 className="font-semibold mb-4">Content</h2>
            <div className="prose max-w-none">
              {post.type === "email" ? (
                <div dangerouslySetInnerHTML={{ __html: post.content }} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans">{post.content}</pre>
              )}
            </div>
          </Card>

          {post.status === "published" && post.metrics && Object.keys(post.metrics).length > 0 && (
            <Card className="p-6 mb-6">
              <h2 className="font-semibold mb-4">Performance Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {post.metrics.likes && (
                  <div>
                    <div className="text-sm text-muted-foreground">Likes</div>
                    <div className="text-2xl font-bold">{post.metrics.likes}</div>
                  </div>
                )}
                {post.metrics.retweets && (
                  <div>
                    <div className="text-sm text-muted-foreground">Retweets</div>
                    <div className="text-2xl font-bold">{post.metrics.retweets}</div>
                  </div>
                )}
                {post.metrics.clicks && (
                  <div>
                    <div className="text-sm text-muted-foreground">Clicks</div>
                    <div className="text-2xl font-bold">{post.metrics.clicks}</div>
                  </div>
                )}
                {post.metrics.signups && (
                  <div>
                    <div className="text-sm text-muted-foreground">Signups</div>
                    <div className="text-2xl font-bold">{post.metrics.signups}</div>
                  </div>
                )}
                {post.metrics.emails_sent && (
                  <div>
                    <div className="text-sm text-muted-foreground">Emails Sent</div>
                    <div className="text-2xl font-bold">{post.metrics.emails_sent}</div>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="font-semibold mb-4">Details</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">
                  {new Date(post.created_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last Updated</dt>
                <dd className="font-medium">
                  {new Date(post.updated_at).toLocaleString()}
                </dd>
              </div>
              {post.publish_date && (
                <div>
                  <dt className="text-muted-foreground">
                    {post.status === "scheduled" ? "Scheduled For" : "Published At"}
                  </dt>
                  <dd className="font-medium">
                    {new Date(post.publish_date).toLocaleString()}
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}

