'use client'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InboxFilter, InboxSort } from '@/app/(dash)/inbox-v2/page'
import { CheckSquare, Square } from 'lucide-react'

type Props = {
  filter: InboxFilter
  sort: InboxSort
  onFilterChange: (filter: InboxFilter) => void
  onSortChange: (sort: InboxSort) => void
  selectedCount: number
  onBulkAction: (action: string) => void
}

export function InboxV2Filters({
  filter,
  sort,
  onFilterChange,
  onSortChange,
  selectedCount,
  onBulkAction,
}: Props) {
  const filterButtons: Array<{ value: InboxFilter; label: string; icon?: string }> = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'hot_leads', label: 'Hot Leads 🔥' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'storm', label: 'Storm' },
    { value: 'needs_reply', label: 'Needs Reply' },
    { value: 'waiting', label: 'Waiting' },
    { value: 'booked', label: 'Booked Appointments' },
  ]

  return (
    <div className="space-y-2">
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <Button
            key={btn.value}
            variant={filter === btn.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFilterChange(btn.value)}
            className="text-xs"
          >
            {btn.label}
          </Button>
        ))}
      </div>

      {/* Sort & Bulk Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Sort:</span>
          <Select value={sort} onValueChange={(v) => onSortChange(v as InboxSort)}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="hottest">Hottest</SelectItem>
              <SelectItem value="storm_affected">Storm Affected</SelectItem>
              <SelectItem value="insurance">Insurance</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">{selectedCount} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkAction('mark_read')}
              className="text-xs h-7"
            >
              Mark Read
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkAction('archive')}
              className="text-xs h-7"
            >
              Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkAction('create_tasks')}
              className="text-xs h-7"
            >
              Create Tasks
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}





















































