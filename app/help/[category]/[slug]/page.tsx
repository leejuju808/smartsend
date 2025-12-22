'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ThumbsUp, ThumbsDown, Clock, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/kb/MarkdownRenderer'

interface Article {
  id: string
  slug: string
  title: string
  category: string
  summary: string
  content: string
  video_url?: string
  video_duration?: number
  screenshot_urls?: string[]
  helpful_count: number
  not_helpful_count: number
}

export default function ArticlePage() {
  const params = useParams()
  const category = params.category as string
  const slug = params.slug as string
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  useEffect(() => {
    fetchArticle()
  }, [category, slug])

  const fetchArticle = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/kb/articles?category=${category}&slug=${slug}`)
      const data = await res.json()
      if (data.articles && data.articles.length > 0) {
        setArticle(data.articles[0])
      }
    } catch (error) {
      console.error('Failed to fetch article:', error)
    } finally {
      setLoading(false)
    }
  }

  const submitFeedback = async (helpful: boolean) => {
    if (feedbackSubmitted) return
    try {
      await fetch(`/api/kb/articles/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helpful }),
      })
      setFeedbackSubmitted(true)
      if (article) {
        setArticle({
          ...article,
          helpful_count: helpful ? article.helpful_count + 1 : article.helpful_count,
          not_helpful_count: !helpful ? article.not_helpful_count + 1 : article.not_helpful_count,
        })
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    }
  }

  const categoryTitles: Record<string, string> = {
    'getting-started': 'Getting Started',
    'templates': 'Campaign Templates',
    'troubleshooting': 'Troubleshooting & Fixes',
    'playbooks': 'SmartSend Playbooks',
    'videos': 'Video Library',
    'billing': 'Billing & Account Management',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Navigation */}
        <Link
          href={`/help/${category}`}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {categoryTitles[category] || category}
        </Link>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">Loading...</div>
        ) : !article ? (
          <div className="text-center text-muted-foreground py-12">Article not found.</div>
        ) : (
          <>
            {/* Fast Answer Snippet */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <div className="font-semibold text-blue-900 mb-1">10-Second Answer</div>
                  <div className="text-sm text-blue-800">{article.summary}</div>
                </div>
              </div>
            </div>

            {/* Article Header */}
            <div className="mb-8">
              <h1 className="text-4xl font-bold tracking-tight mb-4">{article.title}</h1>
              {article.video_url && (
                <div className="mb-6">
                  <a
                    href={article.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                  >
                    <Play className="h-4 w-4" />
                    Watch Video
                    {article.video_duration && (
                      <span className="text-sm opacity-90">
                        ({Math.floor(article.video_duration / 60)}:{String(article.video_duration % 60).padStart(2, '0')})
                      </span>
                    )}
                  </a>
                </div>
              )}
            </div>

            {/* Screenshots */}
            {article.screenshot_urls && article.screenshot_urls.length > 0 && (
              <div className="mb-8 space-y-4">
                {article.screenshot_urls.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Screenshot ${idx + 1}`}
                    className="w-full rounded-lg border"
                  />
                ))}
              </div>
            )}

            {/* Article Content */}
            <div className="bg-white rounded-lg border p-8 mb-8">
              <MarkdownRenderer content={article.content} />
            </div>

            {/* Feedback */}
            <div className="bg-white rounded-lg border p-6">
              <div className="text-sm font-semibold mb-4">Was this helpful?</div>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => submitFeedback(true)}
                  disabled={feedbackSubmitted}
                  className="flex items-center gap-2"
                >
                  <ThumbsUp className="h-4 w-4" />
                  Yes ({article.helpful_count})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => submitFeedback(false)}
                  disabled={feedbackSubmitted}
                  className="flex items-center gap-2"
                >
                  <ThumbsDown className="h-4 w-4" />
                  No ({article.not_helpful_count})
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}






































