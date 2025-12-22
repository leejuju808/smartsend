"use client"

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

export default function Signup() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referredBy, setReferredBy] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [isBeta, setIsBeta] = useState(false)
  const [signupSource, setSignupSource] = useState<string>('direct')

  // Check for beta flag and source tracking on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const refParam = urlParams.get('ref')
    const betaParam = urlParams.get('beta')
    const sourceParam = urlParams.get('source') || urlParams.get('utm_source') || 'direct'
    
    setIsBeta(betaParam === 'true')
    setSignupSource(sourceParam)

    if (refParam) {
      localStorage.setItem('referrer', refParam)
      setReferralCode(refParam)
    } else {
      // Check if referral code already exists in localStorage
      const storedRef = localStorage.getItem('referrer')
      if (storedRef) {
        setReferralCode(storedRef)
      }
    }
  }, [searchParams])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          beta: isBeta,
          signup_source: signupSource,
          referred_by: referredBy?.trim() || null,
        }
      }
    })
    
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Track signup in public_signups table
    if (data.user?.email) {
      try {
        await fetch('/api/signups/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: data.user.email,
            source: signupSource,
            beta: isBeta
          })
        })
      } catch (trackError) {
        console.error('Failed to track signup:', trackError)
        // Don't fail signup if tracking fails
      }
    }

    // If signup successful and we have a referral code, create the referral
    const referrer = referralCode || localStorage.getItem('referrer')
    if (data.user && referrer && data.user.email) {
      try {
        await fetch('/api/referrals/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referralCode: referrer,
            email: data.user.email
          })
        })
      } catch (referralError) {
        console.error('Failed to create referral:', referralError)
        // Don't fail signup if referral creation fails
      }
    }

    setLoading(false)
    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow">
        <h1 className="text-2xl font-bold mb-6">
          {isBeta ? 'Get Early Access ⚡' : 'Create your account'}
        </h1>
        {isBeta && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              🚀 <strong>Launch Beta:</strong> First 50 users get 3 months Growth plan free!
            </p>
          </div>
        )}
        {referralCode && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              🎁 You've been referred by a friend! You'll get <strong>+7 days free trial</strong>.
            </p>
          </div>
        )}
        <form onSubmit={handleSignup} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border rounded-xl"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border rounded-xl"
            required
          />
          <input
            type="text"
            placeholder="Referred by (optional)"
            value={referredBy}
            onChange={(e) => setReferredBy(e.target.value)}
            className="w-full px-4 py-3 border rounded-xl"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 rounded-xl bg-black text-white font-semibold hover:opacity-90"
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-600 text-center">
          Already have an account?{' '}
          <a href="/login" className="text-black font-medium underline">
            Log in
          </a>
        </p>
      </div>
    </main>
  )
}