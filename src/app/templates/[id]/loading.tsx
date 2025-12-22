export default function TemplateDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg border border-gray-200 p-8 animate-pulse">
            {/* Header skeleton */}
            <div className="border-b border-gray-200 pb-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div className="h-8 bg-gray-200 rounded w-64"></div>
                <div className="h-10 bg-gray-200 rounded w-40"></div>
              </div>
              
              <div className="flex gap-2 mb-4">
                <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
                <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
                <div className="h-6 w-24 bg-gray-200 rounded-full"></div>
              </div>
              
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>

            {/* Variables skeleton */}
            <div className="mb-8">
              <div className="h-6 bg-gray-200 rounded w-40 mb-3"></div>
              <div className="flex gap-2">
                <div className="h-8 w-24 bg-gray-200 rounded-md"></div>
                <div className="h-8 w-28 bg-gray-200 rounded-md"></div>
                <div className="h-8 w-20 bg-gray-200 rounded-md"></div>
              </div>
            </div>

            {/* Template body skeleton */}
            <div>
              <div className="h-6 bg-gray-200 rounded w-36 mb-3"></div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 