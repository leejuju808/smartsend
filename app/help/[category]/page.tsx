'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Article {
  id: string
  slug: string
  title: string
  category: string
  summary: string
  order_index: number
}

export default function CategoryPage() {
  const params = useParams()
  const category = params.category as string
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchArticles()
  }, [category])

  const fetchArticles = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/kb/articles?category=${category}`)
      const data = await res.json()
      setArticles(data.articles || [])
    } catch (error) {
      console.error('Failed to fetch articles:', error)
    } finally {
      setLoading(false)
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
        {/* Header */}
        <Link
          href="/help"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Knowledge Base
        </Link>

        <h1 className="text-4xl font-bold tracking-tight mb-4">
          {categoryTitles[category] || category}
        </h1>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">Loading...</div>
        ) : articles.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">No articles found.</div>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => (
              <Link key={article.id} href={`/help/${category}/${article.slug}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardHeader>
                    <CardTitle className="text-xl">{article.title}</CardTitle>
                    <CardDescription>{article.summary}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}






































