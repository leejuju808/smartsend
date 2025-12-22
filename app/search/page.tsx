"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, User, Mail, FileText, MessageSquare, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";

type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  email?: string;
  city?: string;
  tags?: string[];
  lead_status?: string;
  status?: string;
  campaign_id?: string;
  lead_id?: string;
  body?: string;
  from_email?: string;
};

type SearchResults = {
  contacts: SearchResult[];
  leads: SearchResult[];
  replies: SearchResult[];
  notes: SearchResult[];
  campaigns: SearchResult[];
};

export default function SearchResultsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("query") || "";
  const [results, setResults] = useState<SearchResults>({
    contacts: [],
    leads: [],
    replies: [],
    notes: [],
    campaigns: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults({
        contacts: [],
        leads: [],
        replies: [],
        notes: [],
        campaigns: [],
      });
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search/leads?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const hasResults =
    results.contacts.length > 0 ||
    results.leads.length > 0 ||
    results.replies.length > 0 ||
    results.notes.length > 0 ||
    results.campaigns.length > 0;

  const getStatusBadgeColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "hot") return "bg-red-100 text-red-800";
    if (statusLower === "warm") return "bg-orange-100 text-orange-800";
    if (statusLower === "new") return "bg-blue-100 text-blue-800";
    if (statusLower === "follow_up") return "bg-yellow-100 text-yellow-800";
    if (statusLower === "not_interested") return "bg-gray-100 text-gray-800";
    if (statusLower === "out_of_scope") return "bg-gray-100 text-gray-800";
    return "bg-gray-100 text-gray-800";
  };

  const ResultSection = ({
    title,
    icon: Icon,
    items,
    type,
  }: {
    title: string;
    icon: any;
    items: SearchResult[];
    type: string;
  }) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Icon className="h-4 w-4" />
          <span>{title}</span>
          <span className="text-gray-400">({items.length})</span>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={
                type === "contact" || type === "lead"
                  ? `/leads/${item.id}`
                  : type === "reply"
                  ? `/inbox?thread=${item.lead_id}`
                  : type === "note"
                  ? `/leads/${item.lead_id}`
                  : `/campaigns/${item.id}`
              }
              className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-black hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900">{item.title}</h3>
                    {item.lead_status && (
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusBadgeColor(
                          item.lead_status
                        )}`}
                      >
                        {item.lead_status}
                      </span>
                    )}
                    {item.status && (
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusBadgeColor(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    )}
                  </div>
                  {item.subtitle && (
                    <p className="text-sm text-gray-600 mb-1">{item.subtitle}</p>
                  )}
                  {item.email && (
                    <p className="text-sm text-gray-500">{item.email}</p>
                  )}
                  {item.city && (
                    <p className="text-sm text-gray-500">{item.city}</p>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.body && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {item.body}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400 ml-4 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <GlobalSearchBar />
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!query.trim() ? (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Search homeowners, emails, notes...
            </h2>
            <p className="text-gray-600">
              Enter a search query to find contacts, replies, notes, and campaigns
            </p>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
            <p className="mt-4 text-gray-600">Searching...</p>
          </div>
        ) : !hasResults ? (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No results found
            </h2>
            <p className="text-gray-600">
              Try searching with different keywords or check your spelling
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                Search Results for "{query}"
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Found results across {[
                  results.contacts.length > 0 && "contacts",
                  results.leads.length > 0 && "leads",
                  results.replies.length > 0 && "replies",
                  results.notes.length > 0 && "notes",
                  results.campaigns.length > 0 && "campaigns",
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>

            <ResultSection
              title="Homeowners"
              icon={User}
              items={results.contacts}
              type="contact"
            />
            <ResultSection
              title="Leads"
              icon={User}
              items={results.leads}
              type="lead"
            />
            <ResultSection
              title="Messages"
              icon={MessageSquare}
              items={results.replies}
              type="reply"
            />
            <ResultSection
              title="Notes"
              icon={FileText}
              items={results.notes}
              type="note"
            />
            <ResultSection
              title="Campaigns"
              icon={Zap}
              items={results.campaigns}
              type="campaign"
            />
          </div>
        )}
      </div>
    </div>
  );
}





















































