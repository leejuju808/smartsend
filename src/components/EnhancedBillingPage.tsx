'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { getSubscriptionStatus, getUsageLimits, PLANS } from '@/lib/subscription'
import { Check, X, Star, Zap, Shield, Users, BarChart3, Mail } from 'lucide-react'

interface BillingData {
  subscription: any
  usage: any
  loading: boolean
}

interface PricingSuggestion {
  action: "keep" | "upgrade" | "discount";
  reason: string;
  new_price: number | null;
}

export default function EnhancedBillingPage() {
  const [billingData, setBillingData] = useState<BillingData>({
    subscription: null,
    usage: null,
    loading: true
  })
  const [upgrading, setUpgrading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<PricingSuggestion | null>(null)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadBillingData()
    
    // Fetch AI pricing suggestion
    fetch("/api/pricing-suggestion")
      .then((r) => r.json())
      .then((j) => {
        if (j.suggestion) {
          setAiSuggestion(j.suggestion);
        }
      })
      .catch((err) => {
        console.error("Error fetching pricing suggestion:", err);
      });
  }, [])

  const loadBillingData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [subscription, usage] = await Promise.all([
        getSubscriptionStatus(user.id),
        getUsageLimits(user.id)
      ])

      setBillingData({
        subscription,
        usage,
        loading: false
      })
    } catch (error) {
      console.error('Error loading billing data:', error)
      setBillingData(prev => ({ ...prev, loading: false }))
    }
  }

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') return
    
    setUpgrading(true)
    try {
      const response = await fetch(`/api/stripe/checkout?plan=${planId}`)
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setUpgrading(false)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Portal error:', error)
      alert('Failed to open billing portal. Please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  if (billingData.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const currentPlan = billingData.subscription?.plan || 'free'
  const plan = PLANS[currentPlan]

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Billing & Subscription</h1>
          <p className="text-xl text-gray-600">
            Choose the perfect plan for your cold email success
          </p>
        </div>

        {/* Current Plan Status */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Current Plan</h2>
              <p className="text-gray-600">You're currently on the {plan.name} plan</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">${plan.price}/month</div>
              {currentPlan === 'pro' && (
                <div className="text-sm text-green-600 font-medium">Active Subscription</div>
              )}
            </div>
          </div>

          {/* Usage Overview */}
          {billingData.usage && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <Mail className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-sm font-medium text-blue-900">Monthly Sends</div>
                    <div className="text-lg font-bold text-blue-900">
                      {billingData.usage.monthlySends.used} / {billingData.usage.monthlySends.limit}
                    </div>
                  </div>
                </div>
                <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (billingData.usage.monthlySends.used / billingData.usage.monthlySends.limit) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <Zap className="w-5 h-5 text-purple-600" />
                  <div>
                    <div className="text-sm font-medium text-purple-900">AI Optimizations</div>
                    <div className="text-lg font-bold text-purple-900">
                      {billingData.usage.aiOptimizations.used} / {billingData.usage.aiOptimizations.limit === -1 ? '∞' : billingData.usage.aiOptimizations.limit}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="text-sm font-medium text-green-900">Contacts</div>
                    <div className="text-lg font-bold text-green-900">
                      {billingData.usage.contacts.used} / {billingData.usage.contacts.limit === -1 ? '∞' : billingData.usage.contacts.limit}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-orange-50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                  <div>
                    <div className="text-sm font-medium text-orange-900">Campaigns</div>
                    <div className="text-lg font-bold text-orange-900">
                      {billingData.usage.campaigns.used} / {billingData.usage.campaigns.limit === -1 ? '∞' : billingData.usage.campaigns.limit}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manage Subscription */}
          {currentPlan === 'pro' && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {portalLoading ? 'Loading...' : 'Manage Subscription'}
              </button>
            </div>
          )}

          {/* AI Pricing Suggestions */}
          {aiSuggestion?.action === "upgrade" && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="bg-amber-100 text-amber-900 p-4 rounded-md border border-amber-300">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">⚡</span>
                  <div className="flex-1">
                    <p className="font-semibold mb-1">Upgrade Recommendation</p>
                    <p className="text-sm mb-3">
                      Based on your recent growth, your org qualifies for the <b>Pro+ tier</b>.
                      {aiSuggestion.reason && <span className="block mt-1 text-xs text-amber-800">{aiSuggestion.reason}</span>}
                    </p>
                    <button
                      onClick={() => handleUpgrade('pro')}
                      disabled={upgrading || currentPlan === 'pro'}
                      className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Upgrade Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {aiSuggestion?.action === "discount" && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="bg-emerald-100 text-emerald-900 p-4 rounded-md border border-emerald-300">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">💡</span>
                  <div className="flex-1">
                    <p className="font-semibold mb-1">Loyal User Bonus</p>
                    <p className="text-sm">
                      You've earned a temporary offer: <b>${aiSuggestion.new_price || "Special pricing"}</b>
                      {aiSuggestion.reason && <span className="block mt-1 text-xs text-emerald-800">{aiSuggestion.reason}</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Plan Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Free Plan */}
          <div className={`bg-white rounded-2xl shadow-sm border-2 p-8 ${
            currentPlan === 'free' ? 'border-blue-500 ring-4 ring-blue-100' : 'border-gray-200'
          }`}>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Free</h3>
              <div className="text-4xl font-bold text-gray-900 mb-1">$0</div>
              <div className="text-gray-600">per month</div>
            </div>

            <div className="space-y-4 mb-8">
              {plan.features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="text-gray-700">{feature}</span>
                </div>
              ))}
            </div>

            <button
              disabled={currentPlan === 'free'}
              className={`w-full py-3 px-4 rounded-lg font-medium ${
                currentPlan === 'free'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {currentPlan === 'free' ? 'Current Plan' : 'Downgrade'}
            </button>
          </div>

          {/* Pro Plan */}
          <div className={`bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-lg border-2 p-8 ${
            currentPlan === 'pro' ? 'border-white ring-4 ring-blue-200' : 'border-transparent'
          }`}>
            <div className="text-center mb-6">
              <div className="inline-flex items-center space-x-2 mb-2">
                <Star className="w-5 h-5 text-yellow-300" />
                <span className="text-yellow-300 text-sm font-medium">Most Popular</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
              <div className="text-4xl font-bold text-white mb-1">$49</div>
              <div className="text-blue-100">per month</div>
            </div>

            <div className="space-y-4 mb-8">
              {PLANS.pro.features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-white">{feature}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleUpgrade('pro')}
              disabled={upgrading || currentPlan === 'pro'}
              className={`w-full py-3 px-4 rounded-lg font-medium ${
                currentPlan === 'pro'
                  ? 'bg-white/20 text-white cursor-not-allowed'
                  : 'bg-white text-blue-600 hover:bg-gray-50'
              }`}
            >
              {upgrading ? 'Redirecting...' : currentPlan === 'pro' ? 'Current Plan' : 'Upgrade to Pro'}
            </button>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Feature Comparison</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4 font-semibold text-gray-900">Feature</th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-900">Free</th>
                  <th className="text-center py-4 px-4 font-semibold text-blue-600">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Monthly Email Sends</td>
                  <td className="py-4 px-4 text-center text-gray-600">200</td>
                  <td className="py-4 px-4 text-center text-blue-600 font-semibold">5,000</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Campaigns</td>
                  <td className="py-4 px-4 text-center text-gray-600">3</td>
                  <td className="py-4 px-4 text-center text-blue-600 font-semibold">Included</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Email Templates</td>
                  <td className="py-4 px-4 text-center text-gray-600">5</td>
                  <td className="py-4 px-4 text-center text-blue-600 font-semibold">Included</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">AI Optimization</td>
                  <td className="py-4 px-4 text-center text-gray-600">10/month</td>
                  <td className="py-4 px-4 text-center text-blue-600 font-semibold">Included</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Sequences</td>
                  <td className="py-4 px-4 text-center text-gray-600">1</td>
                  <td className="py-4 px-4 text-center text-blue-600 font-semibold">Included</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Integrations</td>
                  <td className="py-4 px-4 text-center text-gray-600">0</td>
                  <td className="py-4 px-4 text-center text-blue-600 font-semibold">5</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Priority Support</td>
                  <td className="py-4 px-4 text-center">
                    <X className="w-5 h-5 text-red-500 mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Custom Domains</td>
                  <td className="py-4 px-4 text-center">
                    <X className="w-5 h-5 text-red-500 mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mt-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Frequently Asked Questions</h3>
          
          <div className="space-y-6 max-w-3xl mx-auto">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Can I change plans at any time?</h4>
              <p className="text-gray-600">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">What happens if I exceed my monthly limits?</h4>
              <p className="text-gray-600">You'll receive a notification when you're close to your limits. To continue, upgrade to Pro for higher limits.</p>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Is there a free trial?</h4>
              <p className="text-gray-600">Yes! Start with our Free plan and upgrade when you're ready for more features and higher limits.</p>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">How do I cancel my subscription?</h4>
              <p className="text-gray-600">You can manage or cancel your subscription through the billing portal. No long-term contracts required.</p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-12">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">Ready to scale your cold email success?</h3>
          <p className="text-lg text-gray-600 mb-6">
            Join thousands of sales teams using SmartSend AI to generate more leads and close more deals.
          </p>
          <button
            onClick={() => handleUpgrade('pro')}
            disabled={upgrading || currentPlan === 'pro'}
            className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg text-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
          >
            {upgrading ? 'Redirecting...' : 'Start Your Pro Trial'}
          </button>
        </div>
      </div>
    </div>
  )
} 