-- AUREV 3.0 Network - Global Federated Intelligence Layer
-- Complete database schema for distributed, self-governing AI network
-- Dec 2028 Vision: 100K orgs, 10M agents, $1M MRR

-- =====================================================
-- 1. Mesh Nodes Table (Local Org Instances)
-- Each organization runs a local AI node
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_mesh_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Node identification
  node_type TEXT NOT NULL CHECK (node_type IN ('smartsend', 'opsgrid', 'agentcloud', 'multi')),
  node_version TEXT NOT NULL DEFAULT '3.0.0',
  node_identifier TEXT UNIQUE NOT NULL, -- Unique network identifier
  
  -- Node status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'syncing')),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_frequency_minutes INTEGER DEFAULT 10, -- Gradient sync frequency
  
  -- Network metrics
  total_agents INTEGER DEFAULT 0,
  total_decisions_today INTEGER DEFAULT 0,
  local_model_accuracy NUMERIC(5, 4) DEFAULT 0, -- 0.0000-1.0000
  last_model_update TIMESTAMPTZ,
  
  -- Mesh connectivity
  mesh_endpoint TEXT, -- Public endpoint for mesh protocol
  mesh_api_key_encrypted TEXT, -- Encrypted API key for mesh auth
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(org_id, node_type)
);

CREATE INDEX IF NOT EXISTS idx_mesh_nodes_org ON public.aurev_mesh_nodes(org_id);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_status ON public.aurev_mesh_nodes(status);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_identifier ON public.aurev_mesh_nodes(node_identifier);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_heartbeat ON public.aurev_mesh_nodes(last_heartbeat);

-- RLS
ALTER TABLE public.aurev_mesh_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY mesh_nodes_read ON public.aurev_mesh_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_mesh_nodes.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY mesh_nodes_insert ON public.aurev_mesh_nodes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_mesh_nodes.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 2. Model Gradients Table
-- Encrypted gradient contributions from local nodes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_gradients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.aurev_mesh_nodes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Gradient metadata
  model_name TEXT NOT NULL, -- e.g., 'agent-decision-v1', 'campaign-optimizer-v2'
  gradient_version INTEGER NOT NULL DEFAULT 1,
  gradient_hash TEXT NOT NULL, -- SHA-256 hash of encrypted gradient
  
  -- Encrypted gradient data (homomorphic encryption)
  encrypted_gradients BYTEA NOT NULL, -- Encrypted gradient vectors
  gradient_size_bytes INTEGER NOT NULL,
  encryption_method TEXT NOT NULL DEFAULT 'he-seal', -- Homomorphic encryption scheme
  
  -- Training metadata
  training_samples INTEGER NOT NULL DEFAULT 0,
  validation_accuracy NUMERIC(5, 4), -- Accuracy on validation set
  training_loss NUMERIC(10, 6),
  
  -- Contribution scoring
  contribution_score NUMERIC(10, 6) DEFAULT 0, -- Quality score for aggregation weighting
  validated BOOLEAN DEFAULT false,
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,
  
  -- Aggregation status
  aggregated BOOLEAN DEFAULT false,
  aggregated_at TIMESTAMPTZ,
  global_model_version INTEGER, -- Which global model this contributed to
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One gradient per node-model-version
  UNIQUE(node_id, model_name, gradient_version)
);

CREATE INDEX IF NOT EXISTS idx_gradients_node ON public.aurev_gradients(node_id);
CREATE INDEX IF NOT EXISTS idx_gradients_org ON public.aurev_gradients(org_id);
CREATE INDEX IF NOT EXISTS idx_gradients_model ON public.aurev_gradients(model_name);
CREATE INDEX IF NOT EXISTS idx_gradients_validated ON public.aurev_gradients(validated, aggregated);
CREATE INDEX IF NOT EXISTS idx_gradients_hash ON public.aurev_gradients(gradient_hash);

-- RLS
ALTER TABLE public.aurev_gradients ENABLE ROW LEVEL SECURITY;

CREATE POLICY gradients_read ON public.aurev_gradients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_gradients.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    OR node_id IN (
      SELECT id FROM public.aurev_mesh_nodes
      WHERE org_id IN (
        SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
      )
    )
  );

-- =====================================================
-- 3. Global Models Table
-- Aggregated global models after federated learning
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_global_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Model identification
  model_name TEXT NOT NULL,
  model_version INTEGER NOT NULL,
  model_architecture TEXT NOT NULL, -- e.g., 'transformer-v1', 'gpt-5-adapter'
  
  -- Model data (encrypted)
  model_weights_hash TEXT NOT NULL, -- Hash of model weights
  model_weights_url TEXT, -- URL to encrypted model storage (S3/GCS)
  model_size_mb NUMERIC(10, 2),
  
  -- Training metadata
  contributing_gradients INTEGER DEFAULT 0, -- Number of gradients aggregated
  contributing_nodes INTEGER DEFAULT 0,
  aggregation_method TEXT NOT NULL DEFAULT 'fedavg', -- fedavg, fedprox, etc.
  
  -- Performance metrics
  global_accuracy NUMERIC(5, 4),
  accuracy_improvement NUMERIC(5, 4), -- vs previous version
  benchmark_scores JSONB DEFAULT '{}'::jsonb,
  
  -- Deployment status
  deployment_status TEXT NOT NULL DEFAULT 'training' CHECK (deployment_status IN ('training', 'validating', 'deployed', 'deprecated')),
  deployed_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(model_name, model_version)
);

CREATE INDEX IF NOT EXISTS idx_global_models_name ON public.aurev_global_models(model_name);
CREATE INDEX IF NOT EXISTS idx_global_models_version ON public.aurev_global_models(model_version);
CREATE INDEX IF NOT EXISTS idx_global_models_deployment ON public.aurev_global_models(deployment_status);

-- RLS - Public read for deployed models only
ALTER TABLE public.aurev_global_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY global_models_read ON public.aurev_global_models
  FOR SELECT USING (
    deployment_status = 'deployed'
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.aurev_mesh_nodes mn ON om.org_id = mn.org_id
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 4. Trust Ledger Table
-- Blockchain-based verification of model contributions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_trust_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.aurev_mesh_nodes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Ledger entry type
  entry_type TEXT NOT NULL CHECK (entry_type IN ('gradient_contribution', 'model_download', 'credit_transaction', 'governance_vote')),
  
  -- Contribution details
  gradient_id UUID REFERENCES public.aurev_gradients(id),
  global_model_id UUID REFERENCES public.aurev_global_models(id),
  credits_earned NUMERIC(10, 2) DEFAULT 0,
  
  -- Blockchain metadata
  transaction_hash TEXT UNIQUE, -- On-chain transaction hash (L2 ledger)
  block_number BIGINT,
  block_timestamp TIMESTAMPTZ,
  
  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_by TEXT, -- Validator identifier
  verification_signature TEXT, -- Cryptographic signature
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(transaction_hash)
);

CREATE INDEX IF NOT EXISTS idx_trust_ledger_node ON public.aurev_trust_ledger(node_id);
CREATE INDEX IF NOT EXISTS idx_trust_ledger_org ON public.aurev_trust_ledger(org_id);
CREATE INDEX IF NOT EXISTS idx_trust_ledger_type ON public.aurev_trust_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_trust_ledger_verified ON public.aurev_trust_ledger(verified);
CREATE INDEX IF NOT EXISTS idx_trust_ledger_hash ON public.aurev_trust_ledger(transaction_hash);

-- RLS
ALTER TABLE public.aurev_trust_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY trust_ledger_read ON public.aurev_trust_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_trust_ledger.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 5. AUREV Credits System
-- Economic layer for compute + model contribution
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Credit balance
  balance NUMERIC(12, 2) DEFAULT 0 NOT NULL,
  lifetime_earned NUMERIC(12, 2) DEFAULT 0,
  lifetime_spent NUMERIC(12, 2) DEFAULT 0,
  
  -- Stripe integration
  stripe_customer_id TEXT,
  last_purchase_at TIMESTAMPTZ,
  last_purchase_amount NUMERIC(10, 2),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(org_id)
);

CREATE TABLE IF NOT EXISTS public.aurev_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  credit_id UUID NOT NULL REFERENCES public.aurev_credits(id) ON DELETE CASCADE,
  
  -- Transaction details
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'spend', 'purchase', 'refund')),
  amount NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(12, 2) NOT NULL,
  
  -- Context
  action_type TEXT, -- 'train_agent', 'contribute_gradient', 'use_api', 'deploy_agent', etc.
  reference_id UUID, -- Reference to gradient, agent, etc.
  description TEXT,
  
  -- Stripe reference (if purchase)
  stripe_payment_intent_id TEXT,
  
  -- Trust ledger link
  trust_ledger_id UUID REFERENCES public.aurev_trust_ledger(id),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credits_org ON public.aurev_credits(org_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_org ON public.aurev_credit_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_credit ON public.aurev_credit_transactions(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.aurev_credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON public.aurev_credit_transactions(created_at DESC);

-- RLS
ALTER TABLE public.aurev_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY credits_read ON public.aurev_credits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_credits.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY credit_transactions_read ON public.aurev_credit_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_credit_transactions.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Update trigger
CREATE TRIGGER update_credits_updated_at
  BEFORE UPDATE ON public.aurev_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 6. Edge Agents Table
-- Lightweight agents executing locally
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_edge_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  node_id UUID REFERENCES public.aurev_mesh_nodes(id) ON DELETE SET NULL,
  
  -- Agent identification
  agent_name TEXT NOT NULL,
  agent_type TEXT NOT NULL, -- 'campaign_optimizer', 'reply_generator', 'lead_scorer', etc.
  agent_version TEXT NOT NULL DEFAULT '1.0.0',
  
  -- Agent status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'training', 'active', 'paused', 'deprecated')),
  autonomy_level NUMERIC(3, 0) DEFAULT 85, -- 0-100% (target: >85%)
  
  -- Model reference
  global_model_id UUID REFERENCES public.aurev_global_models(id),
  local_model_hash TEXT, -- Hash of local model weights
  
  -- Execution metrics
  total_decisions INTEGER DEFAULT 0,
  decisions_today INTEGER DEFAULT 0,
  human_overrides INTEGER DEFAULT 0,
  accuracy_rate NUMERIC(5, 4),
  
  -- Offline capability
  offline_capable BOOLEAN DEFAULT true,
  last_offline_sync TIMESTAMPTZ,
  
  -- Deployment
  deployed_at TIMESTAMPTZ,
  last_decision_at TIMESTAMPTZ,
  
  -- Configuration
  config JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(org_id, agent_name, agent_version)
);

CREATE INDEX IF NOT EXISTS idx_edge_agents_org ON public.aurev_edge_agents(org_id);
CREATE INDEX IF NOT EXISTS idx_edge_agents_node ON public.aurev_edge_agents(node_id);
CREATE INDEX IF NOT EXISTS idx_edge_agents_status ON public.aurev_edge_agents(status);
CREATE INDEX IF NOT EXISTS idx_edge_agents_type ON public.aurev_edge_agents(agent_type);

-- RLS
ALTER TABLE public.aurev_edge_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY edge_agents_read ON public.aurev_edge_agents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_edge_agents.org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY edge_agents_insert ON public.aurev_edge_agents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_edge_agents.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Update trigger
CREATE TRIGGER update_edge_agents_updated_at
  BEFORE UPDATE ON public.aurev_edge_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_aurev_updated_at();

-- =====================================================
-- 7. Global Policy Engine
-- Ethics + compliance governance
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Policy identification
  policy_name TEXT NOT NULL UNIQUE,
  policy_version INTEGER NOT NULL DEFAULT 1,
  policy_category TEXT NOT NULL CHECK (policy_category IN ('ethics', 'compliance', 'safety', 'data_privacy', 'autonomy')),
  
  -- Policy definition
  policy_rules JSONB NOT NULL, -- Structured policy rules
  policy_description TEXT,
  
  -- Enforcement
  enforcement_level TEXT NOT NULL DEFAULT 'advisory' CHECK (enforcement_level IN ('advisory', 'required', 'critical')),
  auto_apply BOOLEAN DEFAULT false,
  
  -- Governance
  approved_by_dao BOOLEAN DEFAULT false,
  approved_by_safety_council BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  effective_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.aurev_policy_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.aurev_edge_agents(id) ON DELETE SET NULL,
  policy_id UUID NOT NULL REFERENCES public.aurev_policies(id) ON DELETE CASCADE,
  
  -- Violation details
  violation_type TEXT NOT NULL,
  violation_severity TEXT NOT NULL CHECK (violation_severity IN ('low', 'medium', 'high', 'critical')),
  violation_details JSONB,
  
  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_category ON public.aurev_policies(policy_category);
CREATE INDEX IF NOT EXISTS idx_policies_status ON public.aurev_policies(status);
CREATE INDEX IF NOT EXISTS idx_policy_violations_org ON public.aurev_policy_violations(org_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_agent ON public.aurev_policy_violations(agent_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_resolved ON public.aurev_policy_violations(resolved);

-- RLS
ALTER TABLE public.aurev_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_policy_violations ENABLE ROW LEVEL SECURITY;

-- Policies are public read for active policies
CREATE POLICY policies_read ON public.aurev_policies
  FOR SELECT USING (status = 'active');

-- Violations only visible to org owners/admins
CREATE POLICY policy_violations_read ON public.aurev_policy_violations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = aurev_policy_violations.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 8. Governance Model (DAO + Safety Council)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.aurev_governance_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  
  -- Token details (non-transferable reputation)
  token_type TEXT NOT NULL CHECK (token_type IN ('dao_member', 'contributor', 'safety_council')),
  reputation_score NUMERIC(10, 2) DEFAULT 0 NOT NULL,
  
  -- Contribution metrics
  contributions_count INTEGER DEFAULT 0,
  validated_gradients INTEGER DEFAULT 0,
  approved_policies INTEGER DEFAULT 0,
  total_decisions_reviewed INTEGER DEFAULT 0,
  
  -- Status
  active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, token_type)
);

CREATE TABLE IF NOT EXISTS public.aurev_governance_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL, -- References policy, model, etc.
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('policy', 'model_release', 'credit_rule', 'network_upgrade')),
  voter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES public.aurev_governance_tokens(id) ON DELETE CASCADE,
  
  -- Vote
  vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject', 'abstain')),
  vote_weight NUMERIC(10, 2) NOT NULL, -- Based on reputation score
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_tokens_user ON public.aurev_governance_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_governance_tokens_type ON public.aurev_governance_tokens(token_type);
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON public.aurev_governance_votes(proposal_id, proposal_type);
CREATE INDEX IF NOT EXISTS idx_governance_votes_voter ON public.aurev_governance_votes(voter_id);

-- RLS
ALTER TABLE public.aurev_governance_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurev_governance_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY governance_tokens_read ON public.aurev_governance_tokens
  FOR SELECT USING (user_id = auth.uid() OR token_type = 'dao_member');

CREATE POLICY governance_votes_read ON public.aurev_governance_votes
  FOR SELECT USING (
    voter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.aurev_governance_tokens gt
      WHERE gt.id = aurev_governance_votes.token_id
      AND gt.user_id = auth.uid()
    )
  );

-- =====================================================
-- 9. Helper Functions
-- =====================================================

-- Register or update mesh node
CREATE OR REPLACE FUNCTION register_mesh_node(
  p_org_id UUID,
  p_node_type TEXT,
  p_node_identifier TEXT,
  p_mesh_endpoint TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_node_id UUID;
BEGIN
  INSERT INTO public.aurev_mesh_nodes (
    org_id, node_type, node_identifier, mesh_endpoint, metadata
  )
  VALUES (
    p_org_id, p_node_type, p_node_identifier, p_mesh_endpoint, p_metadata
  )
  ON CONFLICT (org_id, node_type)
  DO UPDATE SET
    node_identifier = EXCLUDED.node_identifier,
    mesh_endpoint = COALESCE(EXCLUDED.mesh_endpoint, aurev_mesh_nodes.mesh_endpoint),
    last_heartbeat = NOW(),
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_node_id;
  
  RETURN v_node_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Earn credits for contribution
CREATE OR REPLACE FUNCTION earn_aurev_credits(
  p_org_id UUID,
  p_amount NUMERIC,
  p_action_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_credit_id UUID;
  v_transaction_id UUID;
  v_new_balance NUMERIC;
BEGIN
  -- Get or create credit account
  SELECT id INTO v_credit_id
  FROM public.aurev_credits
  WHERE org_id = p_org_id;
  
  IF v_credit_id IS NULL THEN
    INSERT INTO public.aurev_credits (org_id, balance, lifetime_earned)
    VALUES (p_org_id, p_amount, p_amount)
    RETURNING id INTO v_credit_id;
  ELSE
    UPDATE public.aurev_credits
    SET
      balance = balance + p_amount,
      lifetime_earned = lifetime_earned + p_amount,
      updated_at = NOW()
    WHERE id = v_credit_id
    RETURNING balance INTO v_new_balance;
  END IF;
  
  -- Record transaction
  INSERT INTO public.aurev_credit_transactions (
    org_id, credit_id, transaction_type, amount,
    balance_after, action_type, reference_id, description
  )
  VALUES (
    p_org_id, v_credit_id, 'earn', p_amount,
    COALESCE(v_new_balance, (SELECT balance FROM public.aurev_credits WHERE id = v_credit_id)),
    p_action_type, p_reference_id, p_description
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Spend credits
CREATE OR REPLACE FUNCTION spend_aurev_credits(
  p_org_id UUID,
  p_amount NUMERIC,
  p_action_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_credit_id UUID;
  v_transaction_id UUID;
  v_current_balance NUMERIC;
BEGIN
  -- Get credit account
  SELECT id, balance INTO v_credit_id, v_current_balance
  FROM public.aurev_credits
  WHERE org_id = p_org_id;
  
  IF v_credit_id IS NULL THEN
    RAISE EXCEPTION 'No credit account found for org %', p_org_id;
  END IF;
  
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits. Balance: %, Required: %', v_current_balance, p_amount;
  END IF;
  
  -- Deduct credits
  UPDATE public.aurev_credits
  SET
    balance = balance - p_amount,
    lifetime_spent = lifetime_spent + p_amount,
    updated_at = NOW()
  WHERE id = v_credit_id;
  
  -- Record transaction
  INSERT INTO public.aurev_credit_transactions (
    org_id, credit_id, transaction_type, amount,
    balance_after, action_type, reference_id, description
  )
  VALUES (
    p_org_id, v_credit_id, 'spend', p_amount,
    v_current_balance - p_amount,
    p_action_type, p_reference_id, p_description
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record gradient contribution
CREATE OR REPLACE FUNCTION record_gradient_contribution(
  p_node_id UUID,
  p_model_name TEXT,
  p_encrypted_gradients BYTEA,
  p_training_samples INTEGER,
  p_validation_accuracy NUMERIC,
  p_training_loss NUMERIC,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_gradient_id UUID;
  v_org_id UUID;
  v_hash TEXT;
BEGIN
  -- Get org_id from node
  SELECT org_id INTO v_org_id
  FROM public.aurev_mesh_nodes
  WHERE id = p_node_id;
  
  -- Calculate gradient hash
  v_hash := encode(digest(p_encrypted_gradients, 'sha256'), 'hex');
  
  -- Insert gradient
  INSERT INTO public.aurev_gradients (
    node_id, org_id, model_name, encrypted_gradients,
    gradient_size_bytes, training_samples, validation_accuracy,
    training_loss, gradient_hash, metadata
  )
  VALUES (
    p_node_id, v_org_id, p_model_name, p_encrypted_gradients,
    octet_length(p_encrypted_gradients), p_training_samples,
    p_validation_accuracy, p_training_loss, v_hash, p_metadata
  )
  RETURNING id INTO v_gradient_id;
  
  -- Award credits (10 credits per validated batch)
  PERFORM earn_aurev_credits(
    v_org_id,
    10.0,
    'contribute_gradient',
    v_gradient_id,
    format('Gradient contribution: %s', p_model_name)
  );
  
  RETURN v_gradient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 10. Comments
-- =====================================================
COMMENT ON TABLE public.aurev_mesh_nodes IS 'Local AI nodes for each organization in the AUREV 3.0 Network';
COMMENT ON TABLE public.aurev_gradients IS 'Encrypted model gradients from local nodes for federated learning';
COMMENT ON TABLE public.aurev_global_models IS 'Aggregated global models from federated learning';
COMMENT ON TABLE public.aurev_trust_ledger IS 'Blockchain-based ledger of model contributions and transactions';
COMMENT ON TABLE public.aurev_credits IS 'AUREV credit system for economic layer (compute + contributions)';
COMMENT ON TABLE public.aurev_edge_agents IS 'Lightweight edge agents executing locally with offline capability';
COMMENT ON TABLE public.aurev_policies IS 'Global policy engine for ethics, compliance, and safety governance';
COMMENT ON TABLE public.aurev_governance_tokens IS 'Non-transferable governance tokens for DAO participation';







