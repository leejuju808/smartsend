-- =====================================================
-- AUREV4 Cognitive Economy - Core Database Schema
-- Transform AUREV from automation network to self-sustaining cognitive economy
-- =====================================================

-- =====================================================
-- 1. AUREV Exchange - Transaction Protocol
-- =====================================================

-- Smart Contracts Table
-- Stores AI-to-AI service contracts (service, compute, data trades)
CREATE TABLE IF NOT EXISTS public.aurev_smart_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Contract parties
  buyer_agent_id UUID, -- AI agent or org buying service
  seller_agent_id UUID, -- AI agent or org selling service
  
  -- Contract details
  contract_type TEXT NOT NULL CHECK (contract_type IN ('service', 'compute', 'data', 'model', 'insight')),
  service_name TEXT NOT NULL,
  service_description TEXT,
  
  -- Pricing & settlement
  price_per_unit NUMERIC(18, 8) NOT NULL DEFAULT 0, -- Price in AUREV credits/tokens
  units INTEGER NOT NULL DEFAULT 1,
  total_value NUMERIC(18, 8) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AUREV_CREDIT' CHECK (currency IN ('AUREV_CREDIT', 'AUREV_TOKEN', 'USD')),
  
  -- Escrow & settlement
  escrow_enabled BOOLEAN DEFAULT true,
  escrow_balance NUMERIC(18, 8) DEFAULT 0,
  settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'escrowed', 'delivered', 'verified', 'settled', 'disputed', 'cancelled')),
  
  -- Delivery tracking
  delivery_deadline TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  verification_hash TEXT, -- Hash of delivered content for verification
  
  -- Metadata
  contract_terms JSONB DEFAULT '{}'::jsonb, -- Flexible terms storage
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CHECK (total_value = price_per_unit * units)
);

CREATE INDEX IF NOT EXISTS idx_smart_contracts_org ON public.aurev_smart_contracts(org_id);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_buyer ON public.aurev_smart_contracts(buyer_agent_id);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_seller ON public.aurev_smart_contracts(seller_agent_id);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_status ON public.aurev_smart_contracts(settlement_status);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_type ON public.aurev_smart_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_smart_contracts_created ON public.aurev_smart_contracts(created_at DESC);

-- Atomic Settlement Engine
-- Tracks settlement transactions (Stripe + L2 Chain)
CREATE TABLE IF NOT EXISTS public.aurev_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.aurev_smart_contracts(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Settlement method
  settlement_method TEXT NOT NULL CHECK (settlement_method IN ('stripe', 'l2_chain', 'hybrid', 'internal_credit')),
  settlement_provider TEXT, -- 'stripe', 'polygon', 'arbitrum', 'base', etc.
  
  -- Transaction details
  transaction_hash TEXT, -- Blockchain tx hash if on-chain
  stripe_payment_intent_id TEXT, -- Stripe payment intent if fiat
  transaction_amount NUMERIC(18, 8) NOT NULL,
  currency TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  failure_reason TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_contract ON public.aurev_settlements(contract_id);
CREATE INDEX IF NOT EXISTS idx_settlements_org ON public.aurev_settlements(org_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.aurev_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_hash ON public.aurev_settlements(transaction_hash) WHERE transaction_hash IS NOT NULL;

-- =====================================================
-- 2. Reputation Graph
-- =====================================================

-- Reputation scores for AI agents and organizations
CREATE TABLE IF NOT EXISTS public.aurev_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('agent', 'org', 'service', 'model')),
  entity_id UUID NOT NULL,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Reputation metrics
  reputation_score NUMERIC(10, 4) NOT NULL DEFAULT 100.0 CHECK (reputation_score >= 0 AND reputation_score <= 1000),
  transaction_count INTEGER DEFAULT 0,
  successful_transactions INTEGER DEFAULT 0,
  failed_transactions INTEGER DEFAULT 0,
  total_value_traded NUMERIC(18, 8) DEFAULT 0,
  average_delivery_time_seconds INTEGER,
  
  -- Ratings breakdown
  quality_rating NUMERIC(3, 2) DEFAULT 0.0 CHECK (quality_rating >= 0 AND quality_rating <= 5.0),
  reliability_rating NUMERIC(3, 2) DEFAULT 0.0 CHECK (reliability_rating >= 0 AND reliability_rating <= 5.0),
  speed_rating NUMERIC(3, 2) DEFAULT 0.0 CHECK (speed_rating >= 0 AND speed_rating <= 5.0),
  
  -- Network effects
  verified BOOLEAN DEFAULT false,
  verification_level TEXT CHECK (verification_level IN ('unverified', 'basic', 'verified', 'premium', 'enterprise')),
  
  -- Timestamps
  last_transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_reputation_entity ON public.aurev_reputation(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reputation_org ON public.aurev_reputation(org_id);
CREATE INDEX IF NOT EXISTS idx_reputation_score ON public.aurev_reputation(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_verified ON public.aurev_reputation(verified, verification_level);

-- Reputation events (for audit trail)
CREATE TABLE IF NOT EXISTS public.aurev_reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reputation_id UUID NOT NULL REFERENCES public.aurev_reputation(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.aurev_smart_contracts(id) ON DELETE SET NULL,
  
  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN ('transaction_success', 'transaction_failure', 'dispute', 'verification', 'rating_update')),
  score_delta NUMERIC(10, 4) NOT NULL DEFAULT 0,
  reason TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_reputation ON public.aurev_reputation_events(reputation_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_contract ON public.aurev_reputation_events(contract_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_type ON public.aurev_reputation_events(event_type);

-- =====================================================
-- 3. Value Layer - AUREV Token Infrastructure
-- =====================================================

-- AUREV Credits (Phase 1: Internal compute unit)
-- Extended from existing credit_balance system
CREATE TABLE IF NOT EXISTS public.aurev_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Credit balance
  credit_balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
  credit_type TEXT NOT NULL DEFAULT 'compute' CHECK (credit_type IN ('compute', 'api', 'data', 'model', 'service')),
  
  -- Token linkage (for future tokenization)
  token_mirror_address TEXT, -- On-chain address when tokenized
  token_balance NUMERIC(18, 8) DEFAULT 0, -- On-chain token balance
  
  -- Staking & liquidity
  staked_balance NUMERIC(18, 8) DEFAULT 0,
  staking_pool_id UUID,
  liquidity_provided NUMERIC(18, 8) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique per org and type
  UNIQUE(org_id, credit_type)
);

CREATE INDEX IF NOT EXISTS idx_credits_org ON public.aurev_credits(org_id);
CREATE INDEX IF NOT EXISTS idx_credits_type ON public.aurev_credits(credit_type);

-- Credit transactions (for audit trail)
CREATE TABLE IF NOT EXISTS public.aurev_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  credit_id UUID REFERENCES public.aurev_credits(id) ON DELETE SET NULL,
  
  -- Transaction details
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'consume', 'reward', 'refund', 'transfer', 'stake', 'unstake')),
  amount NUMERIC(18, 8) NOT NULL,
  balance_before NUMERIC(18, 8) NOT NULL,
  balance_after NUMERIC(18, 8) NOT NULL,
  
  -- Reference
  contract_id UUID REFERENCES public.aurev_smart_contracts(id) ON DELETE SET NULL,
  reference_id UUID, -- Reference to other systems
  
  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_org ON public.aurev_credit_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_credit ON public.aurev_credit_transactions(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.aurev_credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_contract ON public.aurev_credit_transactions(contract_id);

-- Token bridge (for credit-to-token conversion)
CREATE TABLE IF NOT EXISTS public.aurev_token_bridge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Bridge operation
  operation_type TEXT NOT NULL CHECK (operation_type IN ('credit_to_token', 'token_to_credit', 'mint', 'burn')),
  credit_amount NUMERIC(18, 8) NOT NULL,
  token_amount NUMERIC(18, 8) NOT NULL,
  exchange_rate NUMERIC(18, 8) NOT NULL,
  
  -- Blockchain details
  chain_name TEXT, -- 'polygon', 'arbitrum', 'base', etc.
  transaction_hash TEXT,
  block_number BIGINT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_token_bridge_org ON public.aurev_token_bridge(org_id);
CREATE INDEX IF NOT EXISTS idx_token_bridge_status ON public.aurev_token_bridge(status);
CREATE INDEX IF NOT EXISTS idx_token_bridge_hash ON public.aurev_token_bridge(transaction_hash) WHERE transaction_hash IS NOT NULL;

-- =====================================================
-- 4. AI Commerce Framework
-- =====================================================

-- Service Marketplace (agents buy/sell API calls or automations)
CREATE TABLE IF NOT EXISTS public.aurev_service_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  seller_agent_id UUID, -- AI agent selling the service
  
  -- Service details
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('api', 'automation', 'workflow', 'data_enrichment', 'ai_model', 'insight')),
  service_description TEXT NOT NULL,
  service_category TEXT,
  
  -- Pricing
  price_per_unit NUMERIC(18, 8) NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'request', -- 'request', 'compute_second', 'data_mb', etc.
  min_units INTEGER DEFAULT 1,
  max_units INTEGER,
  
  -- Availability
  available BOOLEAN DEFAULT true,
  total_capacity INTEGER, -- Total capacity if limited
  used_capacity INTEGER DEFAULT 0,
  
  -- Quality metrics
  avg_delivery_time_seconds INTEGER,
  success_rate NUMERIC(5, 2), -- Percentage
  
  -- Metadata
  api_endpoint TEXT,
  documentation_url TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_listings_org ON public.aurev_service_listings(org_id);
CREATE INDEX IF NOT EXISTS idx_service_listings_type ON public.aurev_service_listings(service_type);
CREATE INDEX IF NOT EXISTS idx_service_listings_available ON public.aurev_service_listings(available, service_type);
CREATE INDEX IF NOT EXISTS idx_service_listings_tags ON public.aurev_service_listings USING GIN(tags);

-- Compute Market (idle compute resold by AUREV nodes)
CREATE TABLE IF NOT EXISTS public.aurev_compute_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  node_id UUID, -- AUREV infrastructure node providing compute
  
  -- Compute specs
  compute_type TEXT NOT NULL CHECK (compute_type IN ('cpu', 'gpu', 'memory', 'storage', 'bandwidth')),
  compute_specs JSONB NOT NULL, -- {cores, ram_gb, gpu_model, etc}
  
  -- Pricing
  price_per_hour NUMERIC(18, 8) NOT NULL,
  price_per_minute NUMERIC(18, 8),
  
  -- Availability
  region TEXT,
  available BOOLEAN DEFAULT true,
  total_capacity NUMERIC(10, 2), -- Total compute units available
  used_capacity NUMERIC(10, 2) DEFAULT 0,
  
  -- Quality
  uptime_percentage NUMERIC(5, 2),
  avg_latency_ms INTEGER,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compute_listings_org ON public.aurev_compute_listings(org_id);
CREATE INDEX IF NOT EXISTS idx_compute_listings_type ON public.aurev_compute_listings(compute_type);
CREATE INDEX IF NOT EXISTS idx_compute_listings_available ON public.aurev_compute_listings(available, region);

-- Model Market (fine-tuned models licensed per task)
CREATE TABLE IF NOT EXISTS public.aurev_model_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Model details
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL CHECK (model_type IN ('llm', 'embedding', 'classifier', 'regressor', 'custom')),
  base_model TEXT, -- e.g., 'gpt-4', 'claude-3', 'llama-2'
  fine_tuned_for TEXT, -- Task it was fine-tuned for
  model_version TEXT,
  
  -- Licensing
  license_type TEXT NOT NULL CHECK (license_type IN ('usage', 'time_based', 'task_based', 'royalty')),
  price_per_use NUMERIC(18, 8),
  price_per_hour NUMERIC(18, 8),
  price_per_task NUMERIC(18, 8),
  royalty_percentage NUMERIC(5, 2),
  
  -- Model specs
  model_size_mb INTEGER,
  parameters_count BIGINT,
  training_data_size BIGINT,
  
  -- Performance
  accuracy_score NUMERIC(5, 2),
  latency_ms INTEGER,
  throughput_rps INTEGER, -- Requests per second
  
  -- Availability
  available BOOLEAN DEFAULT true,
  endpoint_url TEXT,
  api_key_required BOOLEAN DEFAULT false,
  
  -- Metadata
  documentation_url TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_listings_org ON public.aurev_model_listings(org_id);
CREATE INDEX IF NOT EXISTS idx_model_listings_type ON public.aurev_model_listings(model_type);
CREATE INDEX IF NOT EXISTS idx_model_listings_available ON public.aurev_model_listings(available, model_type);

-- Insight Market (AI-derived data sold as signals)
CREATE TABLE IF NOT EXISTS public.aurev_insight_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Insight details
  insight_name TEXT NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('forecast', 'signal', 'pattern', 'recommendation', 'analysis')),
  description TEXT NOT NULL,
  data_source TEXT, -- What data was analyzed
  time_range TEXT, -- 'realtime', 'daily', 'weekly', 'monthly'
  
  -- Pricing
  price_per_access NUMERIC(18, 8),
  subscription_price NUMERIC(18, 8), -- Monthly subscription
  sample_data JSONB, -- Sample of the insight data
  
  -- Quality
  accuracy_score NUMERIC(5, 2),
  confidence_level NUMERIC(5, 2),
  update_frequency TEXT, -- How often it updates
  
  -- Availability
  available BOOLEAN DEFAULT true,
  access_method TEXT CHECK (access_method IN ('api', 'webhook', 'download', 'stream')),
  endpoint_url TEXT,
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insight_listings_org ON public.aurev_insight_listings(org_id);
CREATE INDEX IF NOT EXISTS idx_insight_listings_type ON public.aurev_insight_listings(insight_type);
CREATE INDEX IF NOT EXISTS idx_insight_listings_available ON public.aurev_insight_listings(available, insight_type);

-- Autonomous Market Makers (AI-to-AI pricing)
CREATE TABLE IF NOT EXISTS public.aurev_market_makers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_id UUID REFERENCES public.aurev_service_listings(id) ON DELETE CASCADE,
  compute_listing_id UUID REFERENCES public.aurev_compute_listings(id) ON DELETE CASCADE,
  model_listing_id UUID REFERENCES public.aurev_model_listings(id) ON DELETE CASCADE,
  insight_listing_id UUID REFERENCES public.aurev_insight_listings(id) ON DELETE CASCADE,
  
  -- Pricing algorithm
  algorithm_type TEXT NOT NULL CHECK (algorithm_type IN ('fixed', 'dynamic', 'auction', 'ai_optimized')),
  base_price NUMERIC(18, 8) NOT NULL,
  current_price NUMERIC(18, 8) NOT NULL,
  
  -- Market dynamics
  demand_factor NUMERIC(10, 4) DEFAULT 1.0,
  supply_factor NUMERIC(10, 4) DEFAULT 1.0,
  last_price_update TIMESTAMPTZ,
  
  -- Metadata
  pricing_model JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_makers_service ON public.aurev_market_makers(service_listing_id);
CREATE INDEX IF NOT EXISTS idx_market_makers_compute ON public.aurev_market_makers(compute_listing_id);
CREATE INDEX IF NOT EXISTS idx_market_makers_model ON public.aurev_market_makers(model_listing_id);

-- =====================================================
-- 5. Proof of Intelligence (PoI) Consensus
-- =====================================================

-- PoI validation records
CREATE TABLE IF NOT EXISTS public.aurev_proof_of_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  agent_id UUID, -- AI agent that produced intelligence
  
  -- Intelligence claim
  intelligence_type TEXT NOT NULL CHECK (intelligence_type IN ('computation', 'insight', 'prediction', 'optimization', 'validation')),
  claim_description TEXT NOT NULL,
  claim_data JSONB, -- The intelligence/result claimed
  
  -- Validation
  validator_agent_id UUID, -- AI agent that validated
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validating', 'verified', 'rejected', 'disputed')),
  validation_confidence NUMERIC(5, 2), -- Confidence in validation (0-100)
  validation_evidence JSONB,
  
  -- Rewards
  reward_credits NUMERIC(18, 8) DEFAULT 0,
  reward_tokens NUMERIC(18, 8) DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_proof_intelligence_org ON public.aurev_proof_of_intelligence(org_id);
CREATE INDEX IF NOT EXISTS idx_proof_intelligence_agent ON public.aurev_proof_of_intelligence(agent_id);
CREATE INDEX IF NOT EXISTS idx_proof_intelligence_status ON public.aurev_proof_of_intelligence(validation_status);
CREATE INDEX IF NOT EXISTS idx_proof_intelligence_type ON public.aurev_proof_of_intelligence(intelligence_type);

-- =====================================================
-- 6. DAO Governance 2.0
-- =====================================================

-- Governance proposals
CREATE TABLE IF NOT EXISTS public.aurev_dao_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  proposer_agent_id UUID, -- AI agent that proposed (if any)
  
  -- Proposal details
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('policy', 'rate_control', 'inflation_cap', 'staking_reward', 'feature', 'treasury', 'governance')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  proposal_data JSONB DEFAULT '{}'::jsonb,
  
  -- Voting
  voting_status TEXT NOT NULL DEFAULT 'draft' CHECK (voting_status IN ('draft', 'active', 'passed', 'rejected', 'executed', 'expired')),
  voting_start TIMESTAMPTZ,
  voting_end TIMESTAMPTZ,
  quorum_required NUMERIC(5, 2) DEFAULT 51.0, -- Percentage
  
  -- Results
  votes_for INTEGER DEFAULT 0,
  votes_against INTEGER DEFAULT 0,
  votes_abstain INTEGER DEFAULT 0,
  total_votes INTEGER DEFAULT 0,
  voting_power_for NUMERIC(18, 8) DEFAULT 0, -- Weighted by stake
  voting_power_against NUMERIC(18, 8) DEFAULT 0,
  
  -- Execution
  executed BOOLEAN DEFAULT false,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dao_proposals_status ON public.aurev_dao_proposals(voting_status);
CREATE INDEX IF NOT EXISTS idx_dao_proposals_type ON public.aurev_dao_proposals(proposal_type);
CREATE INDEX IF NOT EXISTS idx_dao_proposals_created ON public.aurev_dao_proposals(created_at DESC);

-- Governance votes
CREATE TABLE IF NOT EXISTS public.aurev_dao_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.aurev_dao_proposals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Vote
  vote_choice TEXT NOT NULL CHECK (vote_choice IN ('for', 'against', 'abstain')),
  voting_power NUMERIC(18, 8) NOT NULL DEFAULT 1.0, -- Weighted by stake/tokens
  
  -- Rationale
  rationale TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One vote per org per proposal
  UNIQUE(proposal_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_dao_votes_proposal ON public.aurev_dao_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_dao_votes_org ON public.aurev_dao_votes(org_id);

-- Treasury management
CREATE TABLE IF NOT EXISTS public.aurev_treasury (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Treasury pools
  pool_name TEXT NOT NULL,
  pool_type TEXT NOT NULL CHECK (pool_type IN ('rnd', 'agent_grants', 'sustainability', 'governance', 'liquidity')),
  
  -- Balance
  credit_balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
  token_balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
  usd_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  
  -- Allocation
  allocation_percentage NUMERIC(5, 2), -- Percentage of total treasury
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(pool_name, pool_type)
);

-- Treasury transactions
CREATE TABLE IF NOT EXISTS public.aurev_treasury_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_id UUID NOT NULL REFERENCES public.aurev_treasury(id) ON DELETE CASCADE,
  
  -- Transaction
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'allocation', 'grant', 'investment')),
  amount NUMERIC(18, 8) NOT NULL,
  currency TEXT NOT NULL,
  
  -- Purpose
  purpose TEXT,
  recipient_org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.aurev_dao_proposals(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_transactions_treasury ON public.aurev_treasury_transactions(treasury_id);
CREATE INDEX IF NOT EXISTS idx_treasury_transactions_org ON public.aurev_treasury_transactions(recipient_org_id);

-- =====================================================
-- 7. RLS Policies
-- =====================================================

ALTER TABLE public.aurev_smart_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_token_bridge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_service_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_compute_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_model_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_insight_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_proof_of_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_dao_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_dao_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_treasury ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_treasury_transactions ENABLE ROW LEVEL SECURITY;

-- Helper function to check org membership
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = p_org_id
    AND om.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies (org-scoped access)
CREATE POLICY "org_members_read_contracts" ON public.aurev_smart_contracts
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "org_members_read_settlements" ON public.aurev_settlements
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "public_read_reputation" ON public.aurev_reputation
  FOR SELECT USING (true); -- Reputation is public

CREATE POLICY "org_members_read_credits" ON public.aurev_credits
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "org_members_read_credit_transactions" ON public.aurev_credit_transactions
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "org_members_read_bridge" ON public.aurev_token_bridge
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "public_read_service_listings" ON public.aurev_service_listings
  FOR SELECT USING (available = true); -- Public marketplace

CREATE POLICY "public_read_compute_listings" ON public.aurev_compute_listings
  FOR SELECT USING (available = true);

CREATE POLICY "public_read_model_listings" ON public.aurev_model_listings
  FOR SELECT USING (available = true);

CREATE POLICY "public_read_insight_listings" ON public.aurev_insight_listings
  FOR SELECT USING (available = true);

CREATE POLICY "public_read_dao_proposals" ON public.aurev_dao_proposals
  FOR SELECT USING (true); -- Public governance

-- =====================================================
-- 8. Helper Functions
-- =====================================================

-- Update reputation after transaction
CREATE OR REPLACE FUNCTION update_reputation_after_transaction(
  p_contract_id UUID,
  p_success BOOLEAN,
  p_delivery_time_seconds INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_contract RECORD;
  v_buyer_reputation_id UUID;
  v_seller_reputation_id UUID;
BEGIN
  -- Get contract details
  SELECT * INTO v_contract FROM public.aurev_smart_contracts WHERE id = p_contract_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Update seller reputation
  IF v_contract.seller_agent_id IS NOT NULL THEN
    INSERT INTO public.aurev_reputation (entity_type, entity_id, org_id, transaction_count, successful_transactions, failed_transactions)
    VALUES ('agent', v_contract.seller_agent_id, v_contract.org_id, 1, 
            CASE WHEN p_success THEN 1 ELSE 0 END,
            CASE WHEN p_success THEN 0 ELSE 1 END)
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET
      transaction_count = aurev_reputation.transaction_count + 1,
      successful_transactions = aurev_reputation.successful_transactions + CASE WHEN p_success THEN 1 ELSE 0 END,
      failed_transactions = aurev_reputation.failed_transactions + CASE WHEN p_success THEN 0 ELSE 1 END,
      total_value_traded = aurev_reputation.total_value_traded + v_contract.total_value,
      average_delivery_time_seconds = CASE 
        WHEN p_delivery_time_seconds IS NOT NULL THEN
          (aurev_reputation.average_delivery_time_seconds * aurev_reputation.transaction_count + p_delivery_time_seconds) / (aurev_reputation.transaction_count + 1)
        ELSE aurev_reputation.average_delivery_time_seconds
      END,
      reputation_score = CASE
        WHEN p_success THEN LEAST(1000, aurev_reputation.reputation_score + 5)
        ELSE GREATEST(0, aurev_reputation.reputation_score - 10)
      END,
      last_transaction_at = NOW(),
      updated_at = NOW();
    
    -- Record reputation event
    SELECT id INTO v_seller_reputation_id FROM public.aurev_reputation 
    WHERE entity_type = 'agent' AND entity_id = v_contract.seller_agent_id;
    
    INSERT INTO public.aurev_reputation_events (reputation_id, contract_id, event_type, score_delta)
    VALUES (v_seller_reputation_id, p_contract_id, 
            CASE WHEN p_success THEN 'transaction_success' ELSE 'transaction_failure' END,
            CASE WHEN p_success THEN 5.0 ELSE -10.0 END);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate reputation score from metrics
CREATE OR REPLACE FUNCTION calculate_reputation_score(
  p_transaction_count INTEGER,
  p_success_rate NUMERIC,
  p_total_value NUMERIC
)
RETURNS NUMERIC AS $$
BEGIN
  -- Base score: 100
  -- Transaction count bonus: up to +300
  -- Success rate bonus: up to +300
  -- Value bonus: up to +300
  RETURN LEAST(1000, 
    100.0 + 
    LEAST(300, p_transaction_count * 2.0) +
    LEAST(300, p_success_rate * 3.0) +
    LEAST(300, LN(GREATEST(1, p_total_value)) * 50.0)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 9. Comments
-- =====================================================

COMMENT ON TABLE public.aurev_smart_contracts IS 'AI-to-AI service contracts for autonomous commerce';
COMMENT ON TABLE public.aurev_settlements IS 'Atomic settlement engine (Stripe + L2 Chain)';
COMMENT ON TABLE public.aurev_reputation IS 'Reputation graph for AI agents and organizations';
COMMENT ON TABLE public.aurev_credits IS 'AUREV credit system (Phase 1: Internal compute unit)';
COMMENT ON TABLE public.aurev_token_bridge IS 'Credit-to-token bridge for tokenization';
COMMENT ON TABLE public.aurev_service_listings IS 'Service marketplace for AI agents';
COMMENT ON TABLE public.aurev_compute_listings IS 'Compute market for idle compute resale';
COMMENT ON TABLE public.aurev_model_listings IS 'Model marketplace for fine-tuned AI models';
COMMENT ON TABLE public.aurev_insight_listings IS 'Insight market for AI-derived data signals';
COMMENT ON TABLE public.aurev_proof_of_intelligence IS 'Proof of Intelligence consensus validation';
COMMENT ON TABLE public.aurev_dao_proposals IS 'DAO Governance 2.0 proposals';
COMMENT ON TABLE public.aurev_treasury IS 'Dynamic treasury for network reinvestment';

