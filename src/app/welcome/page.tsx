"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/utils/supabase/client'
import { useToast } from '@/components/ui/toast/ToastProvider'
import { Bolt, Rocket, Loader2 } from 'lucide-react'

export default function WelcomePage() {
  const router = useRouter()
  const supabase = getBrowserSupabase()
  const { push } = useToast()
  const [loading, setLoading] = useState(false)
  const [hasExistingProject, setHasExistingProject] = useState(false)

  // Check if user has any projects
  useEffect(() => {
    async function checkProjects() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (data) {
        setHasExistingProject(true)
      }
    }
    checkProjects()
  }, [supabase, router])

  const handleLoadDemo = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('load_demo_for_user')
      
      if (error) {
        console.error('Failed to load demo:', error)
        push({
          title: 'Error',
          description: error.message || 'Failed to load demo project',
          type: 'error'
        })
        setLoading(false)
        return
      }

      if (data) {
        push({
          title: 'Demo loaded! 🎉',
          description: 'Check out your inbox to see sample conversations',
          type: 'success'
        })
        router.push(`/replies`)
      }
    } catch (err: any) {
      console.error('Error loading demo:', err)
      push({
        title: 'Error',
        description: err.message || 'An unexpected error occurred',
        type: 'error'
      })
      setLoading(false)
    }
  }

  const handleCreateProject = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Create a new project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({ name: 'My First Project' })
        .select()
        .single()

      if (projectError || !project) {
        throw new Error(projectError?.message || 'Failed to create project')
      }

      // Add user as owner
      const { error: memberError } = await supabase
        .from('project_members')
        .insert({
          project_id: project.id,
          user_id: user.id,
          role: 'owner',
          accepted: true,
          accepted_at: new Date().toISOString()
        })

      if (memberError) {
        throw new Error(memberError.message)
      }

      push({
        title: 'Project created! 🚀',
        description: 'Now connect a sending profile to start reaching out',
        type: 'success'
      })
      router.push(`/replies`)
    } catch (err: any) {
      console.error('Error creating project:', err)
      push({
        title: 'Error',
        description: err.message || 'Failed to create project',
        type: 'error'
      })
      setLoading(false)
    }
  }

  // If user has existing project, redirect to replies
  if (hasExistingProject && !loading) {
    router.push('/replies')
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Logo/Branding */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl mb-4">
            <Bolt className="w-10 h-10 text-black" />
          </div>
          <h1 className="text-4xl font-bold mb-3">Welcome to SmartSend ⚡</h1>
          <p className="text-gray-400 text-lg">
            Your AI-powered inbox is ready. Let's get you started.
          </p>
        </div>

        {/* CTA Options */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Load Demo */}
          <button
            onClick={handleLoadDemo}
            disabled={loading}
            className="relative group bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-8 hover:border-yellow-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="absolute top-4 right-4 w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <Rocket className="w-6 h-6 text-yellow-400" />
            </div>
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">Try the Demo</h3>
              <p className="text-gray-400 text-sm">
                Explore SmartSend with sample conversations and replies
              </p>
            </div>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span>2 sample leads</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span>Pre-configured inbox</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span>See how AI works</span>
              </li>
            </ul>
            {loading && (
              <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
              </div>
            )}
          </button>

          {/* Create Live Project */}
          <button
            onClick={handleCreateProject}
            disabled={loading}
            className="relative group bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-8 hover:border-yellow-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="absolute top-4 right-4 w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <Bolt className="w-6 h-6 text-yellow-400" />
            </div>
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">Start from Scratch</h3>
              <p className="text-gray-400 text-sm">
                Create a fresh project and import your own leads
              </p>
            </div>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span>Import your contacts</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span>Connect your mailbox</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-400 mr-2">✓</span>
                <span>Start sending today</span>
              </li>
            </ul>
            {loading && (
              <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
              </div>
            )}
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center text-gray-500 text-sm">
          Don't worry, you can always switch later or create more projects
        </p>
      </div>
    </div>
  )
}

