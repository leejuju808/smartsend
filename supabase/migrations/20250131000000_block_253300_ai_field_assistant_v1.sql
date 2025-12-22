-- ============================================================================
-- Block 253300 — SmartSend AI Field Assistant v1
-- AI-powered roofing assistant for crew members
-- (Crew AI Chatbot for Instructions, Safety Tips, Material Lookups, Install Guides, Real-Time Troubleshooting)
-- ============================================================================

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. AI DOCS TABLE (Knowledge Base)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,     -- installation, safety, materials, warranty, troubleshooting, ventilation, flashing
  title TEXT NOT NULL,
  content TEXT NOT NULL,      -- full text chunk
  embedding vector(1536),     -- OpenAI text-embedding-3-large embeddings
  source TEXT,                -- gaf, owens_corning, certainteed, osha, smartsend
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_ai_docs_category ON ai_docs(category);

-- Index for source lookups
CREATE INDEX IF NOT EXISTS idx_ai_docs_source ON ai_docs(source);

-- HNSW index for vector similarity search (high performance)
CREATE INDEX IF NOT EXISTS idx_ai_docs_embedding_hnsw ON ai_docs 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- ============================================================================
-- 2. RPC FUNCTION FOR SIMILARITY SEARCH
-- ============================================================================

CREATE OR REPLACE FUNCTION match_ai_docs(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 8,
  category_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  title text,
  content text,
  source text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai_docs.id,
    ai_docs.category,
    ai_docs.title,
    ai_docs.content,
    ai_docs.source,
    1 - (ai_docs.embedding <=> query_embedding) AS similarity
  FROM ai_docs
  WHERE ai_docs.embedding IS NOT NULL
    AND (category_filter IS NULL OR ai_docs.category = category_filter)
    AND (1 - (ai_docs.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ai_docs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

ALTER TABLE ai_docs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (crew members) to read AI docs
CREATE POLICY "ai_docs_select_authenticated" ON ai_docs
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access
CREATE POLICY "ai_docs_service_role_all" ON ai_docs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. UPDATE TIMESTAMP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ai_docs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_docs_updated_at
BEFORE UPDATE ON ai_docs
FOR EACH ROW
EXECUTE FUNCTION update_ai_docs_updated_at();

-- ============================================================================
-- 5. INITIAL SEED DATA (Basic SmartSend Knowledge Base)
-- ============================================================================

-- Installation: Step Flashing
INSERT INTO ai_docs (category, title, content, source) VALUES
('installation', 'Step Flashing Installation', 
'Step flashing is installed along roof-to-wall intersections. Each piece of step flashing should be bent at a 90-degree angle, with one leg under the shingles and one leg up against the wall. Install one piece per shingle course, overlapping each piece by at least 2 inches. The top of each step flashing should be covered by the next shingle course. Use roofing cement to seal the vertical leg against the wall. Never nail through the flashing where it will be exposed to weather.', 
'smartsend'),

-- Installation: Nail Patterns
('installation', 'Standard Shingle Nail Pattern', 
'For standard asphalt shingles, use 4-6 nails per shingle. Place nails approximately 1 inch from each edge and 6-8 inches above the exposed edge. For high-wind areas (over 110 mph), use 6 nails per shingle. Nails should penetrate at least 3/4 inch into solid decking material. Never nail too high (will be exposed) or too low (may not hold properly). Use galvanized or stainless steel roofing nails that are long enough to penetrate through shingle and decking.', 
'smartsend'),

-- Installation: Starter Row
('installation', 'Starter Row Pattern', 
'The starter row is installed along the eaves before the first full shingle course. Install starter strip upside down (granules facing down) OR use proper starter strip material. This creates a seal at the bottom edge. The starter row should extend 1/4 to 3/8 inch beyond the drip edge to allow water to flow into gutters. Ensure starter row is straight and properly aligned. For high-wind areas, use adhesive starter strips or apply roofing cement along the edge.', 
'smartsend'),

-- Installation: Ridge Caps
('installation', 'Ridge Cap Installation', 
'Ridge caps are installed along the roof ridge after all field shingles are in place. Cut standard shingles into cap pieces (approximately 12 inches wide) OR use pre-made ridge cap shingles. Install from one end of the ridge to the other, overlapping each piece by approximately 6 inches. Use 2 nails per cap piece, placed approximately 5 inches from each edge. Nails should be covered by the next overlapping piece. Apply roofing cement under the overlap for extra protection in high-wind areas.', 
'smartsend'),

-- Safety: Ladder Placement
('safety', 'Ladder Placement OSHA Rules', 
'Ladders must extend at least 3 feet above the roof edge when used for roof access. Position ladder at a 75-degree angle (1:4 ratio - 1 foot out for every 4 feet up). Secure ladder at top and bottom to prevent slipping. Maintain three-point contact when climbing. Never stand on top three rungs. Inspect ladder for damage before use. Use ladder stabilizer or standoff bracket to prevent damage to gutters. Clear area around ladder base of debris.', 
'osha'),

-- Safety: Harness Requirements
('safety', 'Roof Pitch Harness Requirements', 
'For roof pitches of 4:12 (18.4 degrees) or steeper, fall protection is required. Use full-body harness connected to approved anchor point. Anchor points must support at least 5,000 pounds per worker. Position anchor point above worker to prevent swing fall. Inspect harness and lanyard for damage before each use. Never connect to gutter, vent pipe, or other non-approved anchor. Consider using roof brackets and safety rails as primary protection method.', 
'osha'),

-- Safety: Wind Restrictions
('safety', 'Wind Speed Safety Limits', 
'Do not work on roofs when wind speeds exceed 25-30 mph. Check weather forecast before starting work. Use wind meter if available. High winds can lift shingles and materials, creating dangerous conditions. If wind picks up during work, secure materials and get off roof immediately. Resume work only when wind has calmed. Always secure loose materials and tools when not in use.', 
'osha'),

-- Safety: Heat Safety
('safety', 'Heat Stress Prevention', 
'Work in early morning or late afternoon when possible during hot weather. Take breaks every 15-20 minutes in extreme heat. Drink water frequently (at least 1 cup every 20 minutes). Watch for signs of heat exhaustion: dizziness, nausea, excessive sweating, rapid pulse. Wear light-colored, breathable clothing. Use cooling towels or misting fans when available. Have shade available for break areas. Know emergency procedures and have first aid kit accessible.', 
'osha'),

-- Materials: Bundle Calculation
('materials', 'Bundle to Square Calculation', 
'One square of roofing covers 100 square feet. Standard 3-tab shingles: 3 bundles = 1 square. Architectural/laminated shingles: 3-4 bundles = 1 square (check manufacturer spec). To calculate bundles needed: (Total square footage / 100) × bundles per square. Always add 10-15% waste factor for hips, valleys, and cutting. For example: 31 squares × 3 bundles = 93 bundles, plus 10% waste = 102 bundles minimum.', 
'smartsend'),

-- Materials: Ventilation Requirements
('ventilation', 'Ventilation Requirements by Code', 
'Most building codes require 1 square foot of net free vent area for every 150 square feet of attic space (1:150 ratio). This must be split evenly between intake (soffit) and exhaust (ridge). For example, 1,500 sq ft attic needs 10 sq ft total ventilation (5 sq ft intake, 5 sq ft exhaust). Use ridge vent along entire ridge length, with continuous soffit vents. Never install ridge vent without corresponding soffit intake vents. Check local building code for specific requirements.', 
'smartsend'),

-- Troubleshooting: Rotten Decking
('troubleshooting', 'Rotten Decking Repair Procedure', 
'When rotten decking is found during tear-off: 1) Mark all affected areas clearly. 2) Remove all rotten material down to solid framing. 3) Replace with same thickness decking (typically 1/2" or 5/8" OSB or plywood). 4) Ensure new decking is flush with existing decking. 5) Secure with appropriate fasteners (deck screws or nails per code). 6) Take photos before and after replacement. 7) Document in job notes and update materials used. 8) May require change order if not in original estimate.', 
'smartsend'),

-- Troubleshooting: Shingle Won't Lay Flat
('troubleshooting', 'Shingle Won''t Lay Flat - Causes', 
'If shingles won''t lay flat, common causes: 1) Nails driven too tight (over-driven), creating bumps. 2) Underlayment wrinkles or debris underneath. 3) Decking not flat or damaged. 4) Temperature too cold (shingles become brittle below 40°F). 5) Old shingles left underneath in spot repairs. Solution: Remove problematic shingle, inspect underlayment and decking, ensure clean flat surface, replace shingle properly. In cold weather, work slowly and use hand pressure to ensure adhesion.', 
'smartsend'),

-- Troubleshooting: Pipe Boot Issues
('troubleshooting', 'Cracked Pipe Boot Under Shingles', 
'If pipe boot is cracked and already covered by shingles: 1) Carefully remove shingles around pipe boot. 2) Inspect extent of damage. 3) Replace with new pipe boot appropriate for pipe size. 4) Install new boot with proper flange under surrounding shingles. 5) Apply roofing cement around base of boot. 6) Reinstall shingles around boot, ensuring proper overlap. 7) Check for leaks after installation. 8) Take photos of repair for documentation.', 
'smartsend'),

-- Warranty: Temperature Installation
('warranty', 'Minimum Installation Temperature', 
'Most shingle manufacturers require installation temperatures above 40°F for warranty coverage. Below 40°F, shingles become brittle and may crack when bent. Hand-seal tabs with roofing cement in cold weather to ensure proper adhesion. Some manufacturers allow installation down to 25°F with special procedures (check specific manufacturer guidelines). If installed below minimum temperature without proper procedures, warranty may be voided. Always check manufacturer installation instructions before working in cold weather.', 
'smartsend'),

-- Warranty: Nail Pattern Compliance
('warranty', 'Warranty Voiding - Improper Nailing', 
'Improper nailing can void shingle warranty: 1) Nails driven too high (exposed to weather). 2) Nails driven too low (insufficient penetration). 3) Wrong number of nails (less than manufacturer requirement). 4) Wrong nail type (must be galvanized or stainless steel roofing nails). 5) Over-driven nails (damaging shingles). Always follow manufacturer nailing specifications exactly. For most manufacturers: 4-6 nails per shingle, placed 1 inch from edges, 6-8 inches above exposed edge.', 
'smartsend'),

-- Ventilation: Ridge Vent Alignment
('ventilation', 'Ridge Vent Doesn''t Line Up - Troubleshooting', 
'If ridge vent doesn''t line up: 1) Measure actual ridge length and vent length needed. 2) Ridge may not be perfectly straight (check with string line). 3) Use flexible ridge vent or adjust installation to follow ridge. 4) Ensure proper spacing from ridge ends (typically 6-12 inches). 5) Cut vent sections as needed, ensuring proper overlap between sections. 6) Secure vent according to manufacturer instructions. 7) Install end caps properly to prevent water intrusion.', 
'smartsend');

-- Note: Embeddings will be generated and stored via API when content is created/updated
-- Initial embeddings can be generated using a seed script

COMMENT ON TABLE ai_docs IS 'Knowledge base for AI Field Assistant - roofing installation, safety, materials, troubleshooting, and warranty information';
COMMENT ON COLUMN ai_docs.embedding IS 'OpenAI text-embedding-3-large vector embedding (1536 dimensions) for semantic search';
COMMENT ON FUNCTION match_ai_docs IS 'Performs vector similarity search on ai_docs to find relevant knowledge base entries';
























