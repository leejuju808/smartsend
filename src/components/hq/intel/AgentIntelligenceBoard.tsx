'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';

interface AgentIntelligenceBoardProps {
  orgId: string | null;
}

export default function AgentIntelligenceBoard({ orgId }: AgentIntelligenceBoardProps) {
  const [stats, setStats] = useState({
    totalAgents: 0,
    activeAgents: 0,
    totalTasks: 0,
    successRate: 0,
    topPrompts: [] as Array<{ prompt: string; success_rate: number }>
  });
  
  useEffect(() => {
    if (!orgId) return;
    
    // Fetch agent intelligence stats
    // This would integrate with AgentCloud data
    // For now, showing placeholder structure
    setStats({
      totalAgents: 0,
      activeAgents: 0,
      totalTasks: 0,
      successRate: 0,
      topPrompts: []
    });
  }, [orgId]);
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Agent Intelligence Network</h3>
          <p className="text-sm text-gray-600">Collective learning from all deployed AI agents</p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold">{stats.totalAgents}</div>
            <div className="text-xs text-gray-600">Total Agents</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold">{stats.activeAgents}</div>
            <div className="text-xs text-gray-600">Active Now</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold">{stats.totalTasks.toLocaleString()}</div>
            <div className="text-xs text-gray-600">Total Tasks</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold">{(stats.successRate * 100).toFixed(1)}%</div>
            <div className="text-xs text-gray-600">Success Rate</div>
          </div>
        </div>
        
        <div>
          <div className="text-sm font-semibold mb-3">Top Performing Prompts</div>
          {stats.topPrompts.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              No agent data yet. Deploy agents to see collective intelligence insights.
            </div>
          ) : (
            <div className="space-y-2">
              {stats.topPrompts.map((prompt, idx) => (
                <div key={idx} className="p-3 border rounded-lg">
                  <div className="text-xs font-medium mb-1">{prompt.prompt}</div>
                  <div className="text-xs text-gray-600">
                    {(prompt.success_rate * 100).toFixed(1)}% success rate
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

