'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

export function TemplateSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [tags, setTags] = useState(searchParams.get('tags') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'new');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (tags) params.set('tags', tags);
    if (sort && sort !== 'new') params.set('sort', sort);
    
    const searchString = params.toString();
    router.push(`/templates${searchString ? `?${searchString}` : ''}`);
  };

  const clearFilters = () => {
    setQuery('');
    setTags('');
    setSort('new');
    router.push('/templates');
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (tags) params.set('tags', tags);
    if (newSort && newSort !== 'new') params.set('sort', newSort);
    
    const searchString = params.toString();
    router.push(`/templates${searchString ? `?${searchString}` : ''}`);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
              Search Templates
            </label>
            <input
              id="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Tags
            </label>
            <input
              id="tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="sales, follow-up, intro..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="new">Newest First</option>
              <option value="installs">Most Installed</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
          
          <div className="flex items-end space-x-2">
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Search
            </button>
            {(query || tags || sort !== 'new') && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
} 