export default function Loading() {
  return (
    <div className="max-w-lg mx-auto p-6 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mx-auto"></div>
      <p className="mt-4 text-zinc-500">Processing...</p>
    </div>
  )
}
