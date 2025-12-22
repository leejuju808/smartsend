'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase'
import { CheckCircle, ArrowRight, Mail, Users, Target, Zap, Rocket } from 'lucide-react'

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  required: boolean
  completed: boolean
}

interface OnboardingData {
  companyName: string
  industry: string
  targetAudience: string
  productService: string
  emailDomain: string
  firstTemplate: string
}

export default function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState<OnboardingData>({
    companyName: '',
    industry: '',
    targetAudience: '',
    productService: '',
    emailDomain: '',
    firstTemplate: ''
  })
  const [loading, setLoading] = useState(false)
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    checkOnboardingStatus()
  }, [])

  const checkOnboardingStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Check what's already completed
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed, company_name, industry')
      .eq('id', user.id)
      .single()

    if (profile?.onboarding_completed) {
      router.push('/dashboard')
      return
    }

    if (profile?.company_name) {
      setData(prev => ({ ...prev, companyName: profile.company_name }))
    }
    if (profile?.industry) {
      setData(prev => ({ ...prev, industry: profile.industry }))
    }
  }

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to SmartSend AI',
      description: 'Let’s get you set up for homeowner reach and job flow control in just a few minutes.',
      icon: <Rocket className="w-6 h-6" />,
      required: true,
      completed: false
    },
    {
      id: 'company',
      title: 'Tell us about your company',
      description: 'Help us personalize your experience and templates.',
      icon: <Target className="w-6 h-6" />,
      required: true,
      completed: !!data.companyName
    },
    {
      id: 'audience',
      title: 'Define your target audience',
      description: 'Who are you trying to reach?',
      icon: <Users className="w-6 h-6" />,
      required: true,
      completed: !!data.targetAudience
    },
    {
      id: 'domain',
      title: 'Set up your sender domain',
      description: 'Connect your domain so homeowners actually see your messages.',
      icon: <Mail className="w-6 h-6" />,
      required: true,
      completed: !!data.emailDomain
    },
    {
      id: 'template',
      title: 'Create your first template',
      description: 'Let AI help you craft a compelling homeowner message.',
      icon: <Zap className="w-6 h-6" />,
      required: true,
      completed: !!data.firstTemplate
    },
    {
      id: 'complete',
      title: 'You\'re all set!',
      description: 'Ready to start your first city outreach.',
      icon: <CheckCircle className="w-6 h-6" />,
      required: true,
      completed: false
    }
  ]

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      await completeOnboarding()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const updateData = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const completeOnboarding = async () => {
    setLoading(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Update profile with onboarding data
      await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          company_name: data.companyName,
          industry: data.industry,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      // Create first template if provided
      if (data.firstTemplate) {
        await supabase
          .from('email_templates')
          .insert({
            user_id: user.id,
            name: 'My First Cold Email',
            subject: 'Quick question about {{company}}',
            body: data.firstTemplate,
            target_audience: data.targetAudience,
            product_service: data.productService,
            is_default: true
          })
      }

      // Trigger referral reward if user was referred
      if (user.email) {
        try {
          await fetch('/api/referrals/reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              new_user_id: user.id,
              new_user_email: user.email
            })
          })
        } catch (referralError) {
          console.error('Failed to trigger referral reward:', referralError)
          // Don't fail onboarding if referral reward fails
        }
      }

      // Redirect to dashboard
      router.push('/dashboard?onboarding=complete')
    } catch (error) {
      console.error('Error completing onboarding:', error)
    } finally {
      setLoading(false)
    }
  }

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case 'welcome':
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Rocket className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Welcome to SmartSend AI</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              A system that reaches homeowners in your area every day.
              Let’s get you set up in just a few minutes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              <div className="text-center p-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Smart Targeting</h3>
                <p className="text-sm text-gray-600">AI-powered audience segmentation</p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900">AI Templates</h3>
                <p className="text-sm text-gray-600">Generate homeowner messages instantly</p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Reliability</h3>
                <p className="text-sm text-gray-600">Reliable homeowner reach</p>
              </div>
            </div>
          </div>
        )

      case 'company':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Tell us about your company</h2>
              <p className="text-gray-600">This helps us personalize your experience</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={data.companyName}
                  onChange={(e) => updateData('companyName', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Industry
                </label>
                <select
                  value={data.industry}
                  onChange={(e) => updateData('industry', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select an industry</option>
                  <option value="saas">SaaS / Technology</option>
                  <option value="consulting">Consulting</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="finance">Finance</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="real-estate">Real Estate</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
        )

      case 'audience':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Define your target audience</h2>
              <p className="text-gray-600">Who are you trying to reach?</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Audience *
                </label>
                <textarea
                  value={data.targetAudience}
                  onChange={(e) => updateData('targetAudience', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., B2B SaaS companies with 50-500 employees, marketing directors and VPs, companies using competitor tools..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What are you selling?
                </label>
                <textarea
                  value={data.productService}
                  onChange={(e) => updateData('productService', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., A homeowner outreach system that increases responses by 3x..."
                />
              </div>
            </div>
          </div>
        )

      case 'domain':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Set up your sender domain</h2>
              <p className="text-gray-600">This keeps your homeowner reach reliable</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Domain *
                </label>
                <input
                  type="text"
                  value={data.emailDomain}
                  onChange={(e) => updateData('emailDomain', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="yourcompany.com"
                />
                <p className="text-sm text-gray-500 mt-1">
                  We’ll help you set up DNS records for reliable sending.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Why this matters:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Messages sent from your domain look more professional</li>
                  <li>• More messages reach the homeowner (less spam filtering)</li>
                  <li>• Homeowners trust familiar domains</li>
                </ul>
              </div>
            </div>
          </div>
        )

      case 'template':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Create your first template</h2>
              <p className="text-gray-600">Let AI help you craft a compelling homeowner message</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message template *
                </label>
                <textarea
                  value={data.firstTemplate}
                  onChange={(e) => updateData('firstTemplate', e.target.value)}
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Hi [first_name],\n\nI noticed [company] is using [competitor] for [problem they solve].\n\nI wanted to reach out because we've helped companies like yours [specific benefit/result].\n\nWould you be open to a 15-minute call to discuss how we could help [company] [achieve specific outcome]?\n\nBest regards,\n[Your name]"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Use variables like {"{{first_name}}"}, {"{{company}}"} for personalization
                </p>
              </div>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">You're all set! 🎉</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Congratulations! You've completed the SmartSend AI setup. 
              You're now ready to start your first city outreach and begin controlling job flow.
            </p>
            <div className="bg-gray-50 rounded-lg p-6 max-w-2xl mx-auto">
              <h3 className="font-semibold text-gray-900 mb-3">What's next?</h3>
              <div className="space-y-3 text-left">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-sm font-medium">1</span>
                  </div>
                  <span className="text-gray-700">Import your first contact list</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-sm font-medium">2</span>
                  </div>
                  <span className="text-gray-700">Launch your first city outreach</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-sm font-medium">3</span>
                  </div>
                  <span className="text-gray-700">Track outcomes and adjust</span>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index <= currentStep 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {step.completed ? <CheckCircle className="w-5 h-5" /> : index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-16 h-1 mx-2 ${
                    index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-sm p-8">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className={`px-6 py-3 rounded-lg border ${
              currentStep === 0
                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
          >
            {loading ? (
              'Saving...'
            ) : currentStep === steps.length - 1 ? (
              <>
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
} 