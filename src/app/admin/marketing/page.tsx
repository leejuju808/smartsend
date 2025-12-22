"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
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
}

export default function MarketingDashboard() {
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/marketing");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setError(null);
      } else {
        setError("Failed to load posts");
      }
    } catch (err) {
      console.error("Error fetching posts:", err);
      setError("Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800",
      scheduled: "bg-blue-100 text-blue-800",
      published: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          colors[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status}
      </span>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "thread":
        return "🐦";
      case "video":
        return "🎥";
      case "email":
        return "📧";
      default:
        return "📝";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading marketing posts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  const stats = {
    total: posts.length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status === "draft").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketing Engine ⚡</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule and track your marketing content across Twitter, LinkedIn, and email
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/marketing/new">+ New Post</Link>
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Total Posts</h3>
          <p className="text-2xl font-bold mt-2">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Scheduled</h3>
          <p className="text-2xl font-bold mt-2">{stats.scheduled}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Published</h3>
          <p className="text-2xl font-bold mt-2">{stats.published}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Drafts</h3>
          <p className="text-2xl font-bold mt-2">{stats.draft}</p>
        </Card>
      </div>

      {/* Posts Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post) => (
          <Card key={post.id} className="p-4 space-y-3 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getTypeIcon(post.type)}</span>
                <div>
                  <h3 className="font-semibold text-sm">
                    {post.title || `Untitled ${post.type}`}
                  </h3>
                  <p className="text-xs text-muted-foreground capitalize">{post.type}</p>
                </div>
              </div>
              {getStatusBadge(post.status)}
            </div>

            <p className="text-sm text-gray-600 line-clamp-3">
              {post.content.substring(0, 120)}
              {post.content.length > 120 ? "..." : ""}
            </p>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div>
                {post.publish_date && (
                  <div>
                    {post.status === "scheduled" ? "Scheduled: " : "Published: "}
                    {new Date(post.publish_date).toLocaleDateString()}
                  </div>
                )}
                {!post.publish_date && (
                  <div>Created: {new Date(post.created_at).toLocaleDateString()}</div>
                )}
              </div>
              <Link
                href={`/admin/marketing/${post.id}`}
                className="text-blue-600 hover:underline"
              >
                View →
              </Link>
            </div>

            {/* Metrics */}
            {post.status === "published" && post.metrics && (
              <div className="pt-2 border-t border-gray-200 flex gap-4 text-xs">
                {post.metrics.likes && (
                  <div>
                    <span className="text-muted-foreground">Likes: </span>
                    <span className="font-medium">{post.metrics.likes}</span>
                  </div>
                )}
                {post.metrics.clicks && (
                  <div>
                    <span className="text-muted-foreground">Clicks: </span>
                    <span className="font-medium">{post.metrics.clicks}</span>
                  </div>
                )}
                {post.metrics.signups && (
                  <div>
                    <span className="text-muted-foreground">Signups: </span>
                    <span className="font-medium">{post.metrics.signups}</span>
                  </div>
                )}
                {post.metrics.emails_sent && (
                  <div>
                    <span className="text-muted-foreground">Sent: </span>
                    <span className="font-medium">{post.metrics.emails_sent}</span>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {posts.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No marketing posts yet.</p>
          <Button asChild className="mt-4">
            <Link href="/admin/marketing/new">Create Your First Post</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}

