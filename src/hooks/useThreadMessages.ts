'use client'

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useThreadMessages(threadId?: string) {
  const { data, isLoading, mutate } = useSWR(
    threadId ? `/api/inbox/thread?id=${threadId}` : null,
    fetcher
  )
  return { messages: data?.messages ?? [], isLoading, mutate }
}

