/**
 * AUREV4 Cognitive Economy - Main Export
 * 
 * Unified export for all AUREV4 cognitive economy components
 */

// Import implementations
import { AUREVExchange as ExchangeImpl } from './exchange'
import { AUREVCommerce as CommerceImpl } from './commerce'
import { AUREVReputation as ReputationImpl } from './reputation'
import { AUREVDAO as DAOImpl } from './governance'
import { AUREVProofOfIntelligence as POIImpl } from './proof-of-intelligence'

// Export types and classes
export { AUREVExchange, type SmartContract, type Settlement, type CreateContractRequest } from './exchange'
export { AUREVCommerce, type ServiceListing, type ComputeListing, type ModelListing, type MarketMaker } from './commerce'
export { AUREVReputation, type Reputation, type ReputationEvent } from './reputation'
export { AUREVDAO, type DAOProposal, type DAOVote, type CreateProposalRequest } from './governance'
export { AUREVProofOfIntelligence, type ProofOfIntelligence, type CreatePoIRequest } from './proof-of-intelligence'

// Import types for the client class
import type { AUREVExchange } from './exchange'
import type { AUREVCommerce } from './commerce'
import type { AUREVReputation } from './reputation'
import type { AUREVDAO } from './governance'
import type { AUREVProofOfIntelligence } from './proof-of-intelligence'

/**
 * AUREV4 Cognitive Economy Client
 * 
 * Main client for accessing all AUREV4 cognitive economy features
 */
export class AUREV4Economy {
  exchange: AUREVExchange
  commerce: AUREVCommerce
  reputation: AUREVReputation
  dao: AUREVDAO
  poi: AUREVProofOfIntelligence

  constructor() {
    this.exchange = new ExchangeImpl()
    this.commerce = new CommerceImpl()
    this.reputation = new ReputationImpl()
    this.dao = new DAOImpl()
    this.poi = new POIImpl()
  }
}

