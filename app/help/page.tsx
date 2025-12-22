'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, BookOpen, Video, Wrench, FileText, CreditCard, Rocket } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Category {
  id: string
  slug: string
  title: string
  description: string
  icon: string
}

interface Article {
  id: string
  slug: string
  title: string
  category: string
  summary: string
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'getting-started': Rocket,
  'templates': FileText,
  'troubleshooting': Wrench,
  'playbooks': BookOpen,
  'videos': Video,
  'billing': CreditCard,
}

export default function HelpPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Article[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchArticles(searchQuery)
      }, 300)
      return () => clearTimeout(timeoutId)
    } else {
      setSearchResults([])
    }
  }, [searchQuery])

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/kb/categories')
      const data = await res.json()
      setCategories(data.categories || [])
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  const searchArticles = async (query: string) => {
    setIsSearching(true)
    try {
      const res = await fetch(`/api/kb/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setSearchResults(data.articles || [])
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            SmartSend Knowledge Base
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to reduce support tickets, speed up activation, and increase retention.
          </p>
        </div>

        {/* Search */}
        <div className="mb-12">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search... (e.g., 'how do I get more leads?', 'low open rate', 'storm script')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-lg"
            />
          </div>

          {/* Search Results */}
          {searchQuery.length >= 2 && (
            <div className="mt-6 max-w-2xl mx-auto">
              {isSearching ? (
                <div className="text-center text-muted-foreground">Searching...</div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((article) => (
                    <Link
                      key={article.id}
                      href={`/help/${article.category}/${article.slug}`}
                      className="block p-4 bg-white rounded-lg border hover:border-primary transition-colors"
                    >
                      <div className="font-semibold text-lg mb-1">{article.title}</div>
                      <div className="text-sm text-muted-foreground">{article.summary}</div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  No results found. Try different keywords.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categories */}
        {!searchQuery && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => {
              const Icon = categoryIcons[category.slug] || BookOpen
              return (
                <Link key={category.id} href={`/help/${category.slug}`}>
                  <Card className="h-full hover:border-primary transition-colors cursor-pointer">
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-3xl">{category.icon}</div>
                        <CardTitle className="text-xl">{category.title}</CardTitle>
                      </div>
                      <CardDescription>{category.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}

        {/* Fast Answer Snippets */}
        {!searchQuery && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-6">Quick Answers</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Why is my open rate low?</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Your list is old or your subject line is too generic. Fix: clean list + storm-specific subject line.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Why are no one replying?</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Your message isn't relevant or your list isn't qualified. Fix: use roofing-specific templates + target right homeowners.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">What should I send after a quote?</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Follow up 2-3 days after quote with questions, address objections, and offer to discuss.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Why is my campaign paused?</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    You paused it manually, hit sending limits, or had deliverability issues. Check campaign status and resume.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}






































