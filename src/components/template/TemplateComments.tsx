'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@/lib/supabase'
import { MessageSquare, Send, User, Clock } from 'lucide-react'
import { TemplateComment } from '@/types/database'

interface TemplateCommentsProps {
  templateId: string
  workspaceId: string
}

export default function TemplateComments({ templateId, workspaceId }: TemplateCommentsProps) {
  const [comments, setComments] = useState<TemplateComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [user, setUser] = useState<any>(null)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    loadComments()
    loadUser()
  }, [templateId])

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const loadComments = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('template_comments')
        .select(`
          *,
          user:users(email)
        `)
        .eq('template_id', templateId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error loading comments:', error)
      } else {
        setComments(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !user) return

    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('template_comments')
        .insert({
          template_id: templateId,
          user_id: user.id,
          comment: newComment.trim()
        })
        .select(`
          *,
          user:users(email)
        `)
        .single()

      if (error) {
        console.error('Error submitting comment:', error)
      } else {
        setComments([...comments, data])
        setNewComment('')
        
        // Log team activity
        await supabase.rpc('log_team_activity', {
          p_workspace_id: workspaceId,
          p_action: 'added_comment',
          p_entity_type: 'template',
          p_entity_id: templateId,
          p_details: { comment_length: newComment.length }
        })
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="bg-white border-l border-gray-200 w-80 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center">
          <MessageSquare className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Comments</h3>
          <span className="ml-auto text-sm text-gray-500">{comments.length}</span>
        </div>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-2" />
            <p>No comments yet</p>
            <p className="text-sm">Be the first to leave feedback!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-start space-x-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-white">
                    {comment.user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {comment.user?.email}
                  </p>
                  <div className="flex items-center text-xs text-gray-500 mt-1">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDate(comment.created_at)}
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-700 ml-8">{comment.comment}</p>
            </div>
          ))
        )}
      </div>

      {/* Comment Form */}
      <div className="p-4 border-t border-gray-200">
        <form onSubmit={submitComment} className="space-y-3">
          <div>
            <label htmlFor="comment" className="sr-only">
              Add a comment
            </label>
            <textarea
              id="comment"
              rows={3}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Leave a comment or suggestion..."
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm resize-none"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Posting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Post Comment
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
} 