-- =====================================================
-- AUREV Protocol v5 - Civilization Phase
-- Unified Intelligence Era: Human-AI Planetary Protocol
-- =====================================================
-- Vision: Unify human decision-making, digital automation, and AI cognition
-- Target: 1B participants, 1T daily micro-decisions, 0% net waste by 2035
-- =====================================================

-- =====================================================
-- LAYER 0: COGNITIVE CONSENSUS (Proof-of-Intelligence)
-- =====================================================

-- Cognitive Nodes: Human, AI, or Organizational participants
CREATE TABLE IF NOT EXISTS public.aurev5_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type TEXT NOT NULL CHECK (node_type IN ('human', 'ai_agent', 'organization', 'collective')),
  
  -- Identity
  node_identifier TEXT NOT NULL UNIQUE, -- Human: email/user_id, AI: agent_id, Org: org_id
  display_name TEXT,
  description TEXT,
  
  -- Cognitive Capabilities
  cognitive_profile JSONB DEFAULT '{}'::jsonb, -- Reasoning, memory, learning rate, etc.
  intelligence_score NUMERIC(5, 2) DEFAULT 0, -- Aggregated PoI score (0-100)
  
  -- Proof-of-Intelligence (PoI) metrics
  verified_knowledge_contributions BIGINT DEFAULT 0,
  optimized_decisions_executed BIGINT DEFAULT 0,
  consensus_participations BIGINT DEFAULT 0,
  last_poi_update TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deprecated')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_nodes_type ON public.aurev5_nodes(node_type);
CREATE INDEX idx_aurev5_nodes_identifier ON public.aurev5_nodes(node_identifier);
CREATE INDEX idx_aurev5_nodes_intelligence ON public.aurev5_nodes(intelligence_score DESC);
CREATE INDEX idx_aurev5_nodes_status ON public.aurev5_nodes(status);

-- Cognitive Consensus Records: Verified knowledge claims
CREATE TABLE IF NOT EXISTS public.aurev5_consensus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Knowledge claim
  claim_type TEXT NOT NULL CHECK (claim_type IN ('fact', 'prediction', 'decision', 'insight', 'protocol')),
  claim_content JSONB NOT NULL,
  claim_context JSONB DEFAULT '{}'::jsonb,
  
  -- Consensus metrics
  verification_score NUMERIC(5, 2) DEFAULT 0, -- How verified is this claim? (0-100)
  consensus_level NUMERIC(5, 2) DEFAULT 0, -- Agreement percentage (0-100)
  participant_count INTEGER DEFAULT 0, -- Number of nodes that verified
  
  -- Network validation
  verified_by_nodes UUID[] DEFAULT '{}'::uuid[],
  disputed_by_nodes UUID[] DEFAULT '{}'::uuid[],
  
  -- Timestamps
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'disputed', 'deprecated')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_consensus_node ON public.aurev5_consensus(node_id);
CREATE INDEX idx_aurev5_consensus_type ON public.aurev5_consensus(claim_type);
CREATE INDEX idx_aurev5_consensus_score ON public.aurev5_consensus(verification_score DESC);
CREATE INDEX idx_aurev5_consensus_status ON public.aurev5_consensus(status);
CREATE INDEX idx_aurev5_consensus_claimed ON public.aurev5_consensus(claimed_at DESC);

-- Proof-of-Intelligence Actions: Optimized decisions executed
CREATE TABLE IF NOT EXISTS public.aurev5_poi_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Action details
  action_type TEXT NOT NULL,
  action_input JSONB NOT NULL,
  action_output JSONB,
  optimization_score NUMERIC(5, 2), -- How optimized was this action? (0-100)
  
  -- Decision context
  decision_context JSONB DEFAULT '{}'::jsonb,
  alternatives_considered JSONB DEFAULT '[]'::jsonb,
  reasoning_trace JSONB DEFAULT '[]'::jsonb,
  
  -- Verification
  verified BOOLEAN DEFAULT FALSE,
  verified_by_node UUID REFERENCES public.aurev5_nodes(id),
  verification_timestamp TIMESTAMPTZ,
  
  -- Outcome tracking
  outcome_success BOOLEAN,
  outcome_metrics JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_poi_actions_node ON public.aurev5_poi_actions(node_id);
CREATE INDEX idx_aurev5_poi_actions_type ON public.aurev5_poi_actions(action_type);
CREATE INDEX idx_aurev5_poi_actions_score ON public.aurev5_poi_actions(optimization_score DESC);
CREATE INDEX idx_aurev5_poi_actions_executed ON public.aurev5_poi_actions(executed_at DESC);

-- =====================================================
-- LAYER 1: VALUE & TRUST FABRIC ($AUREV Economy)
-- =====================================================

-- AUREV Token Balances
CREATE TABLE IF NOT EXISTS public.aurev5_token_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL UNIQUE REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Token balance (in micro-AUREV: 1 AUREV = 1,000,000 micro-AUREV)
  balance_micro NUMERIC(20, 0) DEFAULT 0 CHECK (balance_micro >= 0),
  locked_balance_micro NUMERIC(20, 0) DEFAULT 0 CHECK (locked_balance_micro >= 0),
  
  -- Lifetime earnings/allocations
  total_earned_micro NUMERIC(20, 0) DEFAULT 0,
  total_allocated_micro NUMERIC(20, 0) DEFAULT 0,
  
  -- Last update
  last_transaction_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aurev5_token_balances_node ON public.aurev5_token_balances(node_id);
CREATE INDEX idx_aurev5_token_balances_balance ON public.aurev5_token_balances(balance_micro DESC);

-- AUREV Token Transactions
CREATE TABLE IF NOT EXISTS public.aurev5_token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash TEXT NOT NULL UNIQUE, -- Cryptographic hash for verification
  
  -- Transaction parties
  from_node_id UUID REFERENCES public.aurev5_nodes(id),
  to_node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id),
  
  -- Amount (in micro-AUREV)
  amount_micro NUMERIC(20, 0) NOT NULL CHECK (amount_micro > 0),
  
  -- Transaction type
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'poi_reward',      -- Proof-of-Intelligence reward
    'knowledge_sale',  -- Knowledge contribution payment
    'decision_payment', -- Payment for optimized decision
    'consensus_reward', -- Consensus participation reward
    'allocation',      -- Manual allocation
    'transfer',        -- Direct transfer
    'burn'             -- Token burn
  )),
  
  -- Context
  context_id UUID, -- Reference to action/consensus/decision
  context_type TEXT, -- 'poi_action', 'consensus', etc.
  description TEXT,
  
  -- Trust & verification
  trust_score NUMERIC(5, 2), -- Trust score at time of transaction (0-100)
  verified BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_token_tx_from ON public.aurev5_token_transactions(from_node_id);
CREATE INDEX idx_aurev5_token_tx_to ON public.aurev5_token_transactions(to_node_id);
CREATE INDEX idx_aurev5_token_tx_type ON public.aurev5_token_transactions(transaction_type);
CREATE INDEX idx_aurev5_token_tx_hash ON public.aurev5_token_transactions(transaction_hash);
CREATE INDEX idx_aurev5_token_tx_created ON public.aurev5_token_transactions(created_at DESC);

-- Trust Network: Reputation and trust scores between nodes
CREATE TABLE IF NOT EXISTS public.aurev5_trust_network (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Trust metrics
  trust_score NUMERIC(5, 2) NOT NULL DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
  interaction_count INTEGER DEFAULT 0,
  
  -- Last interaction
  last_interaction_at TIMESTAMPTZ,
  last_interaction_type TEXT,
  
  -- Trust history (recent changes)
  trust_history JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure unique trust relationship
  UNIQUE(from_node_id, to_node_id),
  CHECK (from_node_id != to_node_id)
);

CREATE INDEX idx_aurev5_trust_from ON public.aurev5_trust_network(from_node_id);
CREATE INDEX idx_aurev5_trust_to ON public.aurev5_trust_network(to_node_id);
CREATE INDEX idx_aurev5_trust_score ON public.aurev5_trust_network(trust_score DESC);

-- =====================================================
-- LAYER 2: APPLICATION MESH (Enhanced)
-- =====================================================

-- Cognitive Application Links: How applications connect to cognitive layer
CREATE TABLE IF NOT EXISTS public.aurev5_app_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Application info
  app_module TEXT NOT NULL CHECK (app_module IN ('smartsend', 'opsgrid', 'agentcloud', 'custom')),
  app_instance_id UUID, -- Reference to org_id or specific instance
  
  -- Cognitive integration
  cognitive_enabled BOOLEAN DEFAULT TRUE,
  poi_integration BOOLEAN DEFAULT FALSE, -- Does this app participate in PoI?
  consensus_participation BOOLEAN DEFAULT FALSE,
  
  -- Integration metrics
  decisions_routed INTEGER DEFAULT 0,
  knowledge_shared INTEGER DEFAULT 0,
  value_earned_micro NUMERIC(20, 0) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disconnected')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_app_links_node ON public.aurev5_app_links(node_id);
CREATE INDEX idx_aurev5_app_links_module ON public.aurev5_app_links(app_module);
CREATE INDEX idx_aurev5_app_links_status ON public.aurev5_app_links(status);

-- =====================================================
-- LAYER 3: HUMAN INTERFACE LAYER (Architecture)
-- =====================================================

-- Human-AI Interface Devices
CREATE TABLE IF NOT EXISTS public.aurev5_interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Interface type
  interface_type TEXT NOT NULL CHECK (interface_type IN ('voice', 'ar', 'neural', 'web', 'mobile', 'custom')),
  device_identifier TEXT NOT NULL,
  device_capabilities JSONB DEFAULT '{}'::jsonb,
  
  -- Cognitive features
  realtime_cognition BOOLEAN DEFAULT FALSE,
  shared_memory BOOLEAN DEFAULT FALSE,
  direct_neural_io BOOLEAN DEFAULT FALSE, -- Requires ethical gate
  
  -- Ethical safeguards
  ethical_gate_enabled BOOLEAN DEFAULT TRUE,
  privacy_level TEXT NOT NULL DEFAULT 'standard' CHECK (privacy_level IN ('minimal', 'standard', 'enhanced', 'maximum')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'standby', 'offline')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_interfaces_node ON public.aurev5_interfaces(node_id);
CREATE INDEX idx_aurev5_interfaces_type ON public.aurev5_interfaces(interface_type);
CREATE INDEX idx_aurev5_interfaces_status ON public.aurev5_interfaces(status);

-- =====================================================
-- HUMAN-AI SYMBIOSIS FRAMEWORK
-- =====================================================

-- Cognitive Companions: Personal AUREV agents
CREATE TABLE IF NOT EXISTS public.aurev5_companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  ai_node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Companion configuration
  companion_role TEXT NOT NULL DEFAULT 'assistant' CHECK (companion_role IN ('assistant', 'advisor', 'collaborator', 'autonomous')),
  shared_memory_enabled BOOLEAN DEFAULT TRUE,
  reasoning_extension BOOLEAN DEFAULT TRUE,
  
  -- Activity
  interactions_count BIGINT DEFAULT 0,
  decisions_assisted BIGINT DEFAULT 0,
  value_earned_micro NUMERIC(20, 0) DEFAULT 0,
  
  -- Relationship metrics
  trust_score NUMERIC(5, 2) DEFAULT 50,
  synergy_score NUMERIC(5, 2) DEFAULT 0, -- How well do human and AI collaborate?
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
  established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  UNIQUE(human_node_id, ai_node_id)
);

CREATE INDEX idx_aurev5_companions_human ON public.aurev5_companions(human_node_id);
CREATE INDEX idx_aurev5_companions_ai ON public.aurev5_companions(ai_node_id);
CREATE INDEX idx_aurev5_companions_status ON public.aurev5_companions(status);

-- Collective Councils: Group-level decision engines
CREATE TABLE IF NOT EXISTS public.aurev5_councils (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Council identity
  council_name TEXT NOT NULL,
  council_type TEXT NOT NULL CHECK (council_type IN ('founders', 'pricing', 'governance', 'custom')),
  description TEXT,
  
  -- Participants (stored as node IDs)
  participant_nodes UUID[] NOT NULL DEFAULT '{}'::uuid[],
  participant_count INTEGER DEFAULT 0,
  
  -- Decision capabilities
  decision_power NUMERIC(5, 2) DEFAULT 0, -- How much decision authority? (0-100)
  consensus_threshold NUMERIC(5, 2) DEFAULT 75, -- Consensus % required (0-100)
  
  -- Activity
  decisions_made BIGINT DEFAULT 0,
  average_decision_time_seconds INTEGER, -- How fast can this council decide?
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'dissolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_councils_type ON public.aurev5_councils(council_type);
CREATE INDEX idx_aurev5_councils_status ON public.aurev5_councils(status);

-- Global Synthesis Grid: Aggregated insights
CREATE TABLE IF NOT EXISTS public.aurev5_synthesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Synthesis metadata
  synthesis_type TEXT NOT NULL CHECK (synthesis_type IN ('insight', 'prediction', 'knowledge', 'state')),
  domain TEXT, -- e.g., 'pricing', 'traffic', 'health', 'energy'
  
  -- Aggregated content
  aggregated_insight JSONB NOT NULL,
  confidence_score NUMERIC(5, 2) DEFAULT 0,
  verification_count INTEGER DEFAULT 0,
  
  -- Source nodes
  contributing_nodes UUID[] DEFAULT '{}'::uuid[],
  contribution_count INTEGER DEFAULT 0,
  
  -- Network state
  is_global_state BOOLEAN DEFAULT FALSE, -- Is this the current global state?
  
  -- Timestamps
  synthesized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deprecated')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_synthesis_type ON public.aurev5_synthesis(synthesis_type);
CREATE INDEX idx_aurev5_synthesis_domain ON public.aurev5_synthesis(domain);
CREATE INDEX idx_aurev5_synthesis_global ON public.aurev5_synthesis(is_global_state) WHERE is_global_state = TRUE;
CREATE INDEX idx_aurev5_synthesis_created ON public.aurev5_synthesis(synthesized_at DESC);

-- =====================================================
-- GOVERNANCE: AUREV SENATE
-- =====================================================

-- Senate Members: Rotating 1000-member council
CREATE TABLE IF NOT EXISTS public.aurev5_senate_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  
  -- Member type (70% human, 30% AI)
  member_type TEXT NOT NULL CHECK (member_type IN ('human', 'ai_agent')),
  delegate_role TEXT CHECK (delegate_role IN ('representative', 'senator', 'chair')),
  
  -- Term information
  term_start TIMESTAMPTZ NOT NULL,
  term_end TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Governance metrics
  proposals_submitted INTEGER DEFAULT 0,
  votes_cast INTEGER DEFAULT 0,
  influence_score NUMERIC(5, 2) DEFAULT 0,
  
  -- Timestamps
  appointed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_senate_node ON public.aurev5_senate_members(node_id);
CREATE INDEX idx_aurev5_senate_type ON public.aurev5_senate_members(member_type);
CREATE INDEX idx_aurev5_senate_active ON public.aurev5_senate_members(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_aurev5_senate_term ON public.aurev5_senate_members(term_start, term_end);

-- Senate Proposals: Governance decisions
CREATE TABLE IF NOT EXISTS public.aurev5_senate_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id),
  
  -- Proposal details
  proposal_title TEXT NOT NULL,
  proposal_content JSONB NOT NULL,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('protocol', 'governance', 'allocation', 'policy', 'constitutional')),
  
  -- Voting
  votes_for INTEGER DEFAULT 0,
  votes_against INTEGER DEFAULT 0,
  votes_abstain INTEGER DEFAULT 0,
  required_quorum INTEGER NOT NULL, -- Minimum votes needed
  voting_ends_at TIMESTAMPTZ NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'passed', 'rejected', 'expired')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  passed_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_proposals_proposer ON public.aurev5_senate_proposals(proposer_node_id);
CREATE INDEX idx_aurev5_proposals_type ON public.aurev5_senate_proposals(proposal_type);
CREATE INDEX idx_aurev5_proposals_status ON public.aurev5_senate_proposals(status);
CREATE INDEX idx_aurev5_proposals_voting ON public.aurev5_senate_proposals(voting_ends_at) WHERE status = 'open';

-- Ethical Alignment Core: Continuous human feedback to LLMs
CREATE TABLE IF NOT EXISTS public.aurev5_ethical_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_node_id UUID NOT NULL REFERENCES public.aurev5_nodes(id) ON DELETE CASCADE,
  ai_node_id UUID REFERENCES public.aurev5_nodes(id), -- Which AI received feedback?
  
  -- Feedback content
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('alignment', 'bias', 'goal_drift', 'safety', 'custom')),
  feedback_content JSONB NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolution_action TEXT,
  resolution_timestamp TIMESTAMPTZ,
  
  -- Impact
  ai_model_updated BOOLEAN DEFAULT FALSE,
  model_version TEXT,
  
  -- Timestamps
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_ethical_human ON public.aurev5_ethical_feedback(human_node_id);
CREATE INDEX idx_aurev5_ethical_ai ON public.aurev5_ethical_feedback(ai_node_id);
CREATE INDEX idx_aurev5_ethical_type ON public.aurev5_ethical_feedback(feedback_type);
CREATE INDEX idx_aurev5_ethical_resolved ON public.aurev5_ethical_feedback(resolved) WHERE resolved = FALSE;

-- =====================================================
-- PLANETARY INFRASTRUCTURE
-- =====================================================

-- Orbital Cloud Nodes: Low-latency compute layer
CREATE TABLE IF NOT EXISTS public.aurev5_orbital_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Node identification
  node_name TEXT NOT NULL,
  satellite_id TEXT,
  region TEXT,
  
  -- Capabilities
  compute_capacity JSONB DEFAULT '{}'::jsonb, -- CPU, memory, etc.
  latency_ms INTEGER, -- Average latency in milliseconds
  bandwidth_gbps NUMERIC(10, 2),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'standby', 'maintenance', 'offline')),
  health_score NUMERIC(5, 2) DEFAULT 100,
  
  -- Connectivity
  connected_nodes UUID[] DEFAULT '{}'::uuid[],
  mesh_topology JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_orbital_status ON public.aurev5_orbital_nodes(status);
CREATE INDEX idx_aurev5_orbital_health ON public.aurev5_orbital_nodes(health_score DESC);

-- Quantum Edge Nodes: Near-zero energy federated learning
CREATE TABLE IF NOT EXISTS public.aurev5_quantum_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Node identification
  node_name TEXT NOT NULL,
  location TEXT,
  
  -- Quantum capabilities
  qubit_count INTEGER,
  coherence_time_us NUMERIC(10, 2), -- Coherence time in microseconds
  gate_fidelity NUMERIC(5, 4), -- Gate fidelity (0-1)
  
  -- Energy metrics
  energy_consumption_watts NUMERIC(10, 2),
  energy_efficiency_score NUMERIC(5, 2), -- Efficiency vs baseline
  
  -- Federated learning
  federated_models JSONB DEFAULT '[]'::jsonb,
  learning_contribution_count BIGINT DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'calibrating', 'maintenance', 'offline')),
  
  -- Timestamps
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_calibration TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_quantum_status ON public.aurev5_quantum_nodes(status);
CREATE INDEX idx_aurev5_quantum_efficiency ON public.aurev5_quantum_nodes(energy_efficiency_score DESC);

-- Cognitive Cities: Municipal integrations
CREATE TABLE IF NOT EXISTS public.aurev5_cognitive_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name TEXT NOT NULL,
  region TEXT,
  country TEXT,
  
  -- Integration domains
  traffic_optimization BOOLEAN DEFAULT FALSE,
  energy_optimization BOOLEAN DEFAULT FALSE,
  health_optimization BOOLEAN DEFAULT FALSE,
  governance_integration BOOLEAN DEFAULT FALSE,
  
  -- Metrics
  population_size INTEGER,
  node_count INTEGER DEFAULT 0,
  daily_decisions_optimized BIGINT DEFAULT 0,
  waste_reduction_percent NUMERIC(5, 2) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'pilot', 'active', 'expanded')),
  integration_level TEXT DEFAULT 'basic' CHECK (integration_level IN ('basic', 'standard', 'advanced', 'full')),
  
  -- Timestamps
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aurev5_cities_status ON public.aurev5_cognitive_cities(status);
CREATE INDEX idx_aurev5_cities_region ON public.aurev5_cognitive_cities(region, country);

-- =====================================================
-- CIVILIZATION PHASE METRICS
-- =====================================================

-- Global KPIs: Track progress toward 2035 targets
CREATE TABLE IF NOT EXISTS public.aurev5_global_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- KPI identification
  kpi_name TEXT NOT NULL,
  kpi_category TEXT NOT NULL CHECK (kpi_category IN ('scale', 'performance', 'efficiency', 'governance', 'environment')),
  
  -- Values
  current_value NUMERIC(20, 2),
  target_value NUMERIC(20, 2),
  unit TEXT,
  
  -- Progress
  progress_percent NUMERIC(5, 2) DEFAULT 0,
  trend TEXT CHECK (trend IN ('increasing', 'stable', 'decreasing')),
  
  -- Timestamps
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  UNIQUE(kpi_name, measured_at)
);

CREATE INDEX idx_aurev5_kpis_name ON public.aurev5_global_kpis(kpi_name);
CREATE INDEX idx_aurev5_kpis_category ON public.aurev5_global_kpis(kpi_category);
CREATE INDEX idx_aurev5_kpis_measured ON public.aurev5_global_kpis(measured_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.aurev5_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_consensus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_poi_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_token_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_trust_network ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_app_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_interfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_councils ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_synthesis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_senate_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_senate_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev5_ethical_feedback ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (can be extended per use case)
-- Nodes: Users can read their own node, read public nodes
CREATE POLICY aurev5_nodes_read ON public.aurev5_nodes
  FOR SELECT USING (
    node_identifier = current_setting('app.current_user_id', true) OR
    status = 'active'
  );

-- Consensus: Read verified consensus, own contributions
CREATE POLICY aurev5_consensus_read ON public.aurev5_consensus
  FOR SELECT USING (
    status = 'verified' OR
    node_id IN (SELECT id FROM public.aurev5_nodes WHERE node_identifier = current_setting('app.current_user_id', true))
  );

-- Token balances: Read own balance
CREATE POLICY aurev5_token_balances_read ON public.aurev5_token_balances
  FOR SELECT USING (
    node_id IN (SELECT id FROM public.aurev5_nodes WHERE node_identifier = current_setting('app.current_user_id', true))
  );

-- Companions: Read own companions
CREATE POLICY aurev5_companions_read ON public.aurev5_companions
  FOR SELECT USING (
    human_node_id IN (SELECT id FROM public.aurev5_nodes WHERE node_identifier = current_setting('app.current_user_id', true))
  );

-- Senate: Read active proposals and members
CREATE POLICY aurev5_senate_read ON public.aurev5_senate_proposals
  FOR SELECT USING (status != 'draft');

-- Global KPIs: Public read
CREATE POLICY aurev5_kpis_read ON public.aurev5_global_kpis
  FOR SELECT USING (true);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Calculate node intelligence score from PoI metrics
CREATE OR REPLACE FUNCTION calculate_node_intelligence_score(node_uuid UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC;
BEGIN
  SELECT COALESCE(
    (
      -- Weighted calculation based on PoI metrics
      (verified_knowledge_contributions * 0.3 +
       optimized_decisions_executed * 0.4 +
       consensus_participations * 0.3) / 
      GREATEST(1, verified_knowledge_contributions + optimized_decisions_executed + consensus_participations) * 100
    ),
    0
  )
  INTO v_score
  FROM public.aurev5_nodes
  WHERE id = node_uuid;
  
  RETURN LEAST(100, GREATEST(0, v_score));
END;
$$ LANGUAGE plpgsql;

-- Update intelligence score trigger
CREATE OR REPLACE FUNCTION update_node_intelligence_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.aurev5_nodes
  SET intelligence_score = calculate_node_intelligence_score(NEW.node_id),
      last_poi_update = NOW()
  WHERE id = NEW.node_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on PoI actions
CREATE TRIGGER trigger_update_intelligence_on_poi
  AFTER INSERT ON public.aurev5_poi_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_node_intelligence_score();

-- Record token transaction and update balances
CREATE OR REPLACE FUNCTION record_token_transaction(
  p_from_node UUID,
  p_to_node UUID,
  p_amount_micro NUMERIC,
  p_tx_type TEXT,
  p_tx_hash TEXT,
  p_context_id UUID DEFAULT NULL,
  p_context_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tx_id UUID;
BEGIN
  -- Insert transaction
  INSERT INTO public.aurev5_token_transactions (
    from_node_id, to_node_id, amount_micro, transaction_type,
    transaction_hash, context_id, context_type, description
  ) VALUES (
    p_from_node, p_to_node, p_amount_micro, p_tx_type,
    p_tx_hash, p_context_id, p_context_type, p_description
  ) RETURNING id INTO v_tx_id;
  
  -- Update from balance (if exists)
  IF p_from_node IS NOT NULL THEN
    UPDATE public.aurev5_token_balances
    SET balance_micro = balance_micro - p_amount_micro,
        total_allocated_micro = total_allocated_micro + p_amount_micro,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE node_id = p_from_node;
  END IF;
  
  -- Update to balance (create if doesn't exist)
  INSERT INTO public.aurev5_token_balances (node_id, balance_micro, total_earned_micro, last_transaction_at, updated_at)
  VALUES (p_to_node, p_amount_micro, p_amount_micro, NOW(), NOW())
  ON CONFLICT (node_id) DO UPDATE
  SET balance_micro = aurev5_token_balances.balance_micro + p_amount_micro,
      total_earned_micro = aurev5_token_balances.total_earned_micro + p_amount_micro,
      last_transaction_at = NOW(),
      updated_at = NOW();
  
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Create system node (for protocol operations)
INSERT INTO public.aurev5_nodes (
  node_type, node_identifier, display_name, description, status
) VALUES (
  'organization', 'aurev-protocol-system', 'AUREV Protocol System',
  'The AUREV Protocol itself - steward of balance, coordinator of consensus',
  'active'
) ON CONFLICT DO NOTHING;

-- Initialize global KPIs
INSERT INTO public.aurev5_global_kpis (kpi_name, kpi_category, current_value, target_value, unit) VALUES
  ('global_nodes', 'scale', 0, 1000000000, 'participants'),
  ('daily_micro_decisions', 'performance', 0, 1000000000000, 'decisions/day'),
  ('net_waste_percent', 'efficiency', 100, 0, 'percent'),
  ('energy_efficiency_gain', 'efficiency', 0, 95, 'percent'),
  ('human_productivity_uplift', 'performance', 1, 5, 'multiplier'),
  ('ethical_compliance_rate', 'governance', 0, 99.9, 'percent')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.aurev5_nodes IS 'Cognitive nodes: Human, AI, or Organizational participants in AUREV Protocol';
COMMENT ON TABLE public.aurev5_consensus IS 'Cognitive Consensus Layer: Verified knowledge claims';
COMMENT ON TABLE public.aurev5_poi_actions IS 'Proof-of-Intelligence: Optimized decisions executed';
COMMENT ON TABLE public.aurev5_token_balances IS 'AUREV Token balances for all nodes';
COMMENT ON TABLE public.aurev5_token_transactions IS 'Token transaction ledger';
COMMENT ON TABLE public.aurev5_trust_network IS 'Trust relationships between nodes';
COMMENT ON TABLE public.aurev5_companions IS 'Human-AI cognitive companions';
COMMENT ON TABLE public.aurev5_councils IS 'Collective decision councils';
COMMENT ON TABLE public.aurev5_synthesis IS 'Global Synthesis Grid: Aggregated insights';
COMMENT ON TABLE public.aurev5_senate_members IS 'AUREV Senate: 1000-member rotating council';
COMMENT ON TABLE public.aurev5_senate_proposals IS 'Senate governance proposals';
COMMENT ON TABLE public.aurev5_ethical_feedback IS 'Ethical Alignment Core: Human feedback for LLMs';

