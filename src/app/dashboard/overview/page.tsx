"use client"
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function OverviewPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) {
        router.push('/login')
      } else {
        setUser(data.user)
      }
    }
    getUser()
  }, [supabase, router])

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900">
        Welcome{user ? `, ${user.email}` : ''} 👋
      </h2>
      <p className="mt-4 text-gray-600">
        This is your SmartSendAI dashboard. Soon you’ll manage campaigns,
        contacts, and billing here.
      </p>

      {/* Placeholder cards */}
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition">
          <h3 className="text-lg font-semibold">✉️ Campaigns</h3>
          <p className="mt-2 text-gray-600">
            Create and track your cold email campaigns.
          </p>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition">
          <h3 className="text-lg font-semibold">👥 Contacts</h3>
          <p className="mt-2 text-gray-600">
            Import leads and manage your audience lists.
          </p>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition">
          <h3 className="text-lg font-semibold">💳 Billing</h3>
          <p className="mt-2 text-gray-600">
            Upgrade your plan and manage subscription settings.
          </p>
        </div>
      </div>
    </div>
  )
}

