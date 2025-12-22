import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const metadata = {
  title: "Blog | AUREV HQ",
  description: "Insights on AI automation, business operations, and the future of work",
};

export default function BlogPage() {
  const posts = [
    {
      slug: "launch",
      title: "We Built the AI Operating System for SMBs — Here's Why",
      excerpt: "AUREV HQ was born from a simple frustration: founders shouldn't waste hours gluing tools together. AI should just handle it.",
      date: "January 15, 2025",
      author: "Julian Lee",
      readTime: "5 min read",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-24">
        {/* Header */}
        <div className="space-y-4 mb-16">
          <Link href="/" className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors">
            <span className="text-sm">← Back</span>
          </Link>
          <h1 className="text-5xl font-extrabold tracking-tight">
            AUREV HQ Blog ⚡
          </h1>
          <p className="text-xl text-gray-400">
            Insights on AI automation, business operations, and the future of work
          </p>
        </div>

        {/* Posts */}
        <div className="space-y-8">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="group border border-gray-800 rounded-2xl p-8 hover:border-amber-500/50 transition-all bg-gray-950/50"
            >
              <Link href={`/blog/${post.slug}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span>{post.date}</span>
                    <span>•</span>
                    <span>{post.readTime}</span>
                    <span>•</span>
                    <span>{post.author}</span>
                  </div>
                </div>
                <h2 className="text-3xl font-bold mb-3 group-hover:text-amber-400 transition-colors">
                  {post.title}
                </h2>
                <p className="text-lg text-gray-300 leading-relaxed">
                  {post.excerpt}
                </p>
                <div className="mt-6 flex items-center gap-2 text-amber-400 group-hover:gap-4 transition-all">
                  <span className="text-sm font-semibold">Read More</span>
                  <span>→</span>
                </div>
              </Link>
            </article>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-24 border-t border-gray-800 pt-12 text-center">
          <p className="text-gray-400">
            Stay updated with AUREV HQ
          </p>
          <Button size="lg" className="mt-4 bg-amber-600 hover:bg-amber-700 text-black">
            Subscribe to Updates
          </Button>
        </div>
      </div>
    </div>
  );
}

