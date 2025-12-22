import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CRMContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  industry?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

export interface CRMOpportunity {
  id: string;
  contactId: string;
  name: string;
  value?: number;
  stage: string;
  source?: string;
  notes?: string;
}

export class CRMSyncService {
  private crmType: 'hubspot' | 'gohighlevel' | 'pipedrive' | 'salesforce';
  private apiKey: string;
  private apiUrl?: string;

  constructor(crmType: string, apiKey: string, apiUrl?: string) {
    this.crmType = crmType as any;
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  async syncContact(contact: CRMContact, userId: string): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      switch (this.crmType) {
        case 'hubspot':
          return await this.syncToHubSpot(contact);
        case 'gohighlevel':
          return await this.syncToGoHighLevel(contact);
        case 'pipedrive':
          return await this.syncToPipedrive(contact);
        case 'salesforce':
          return await this.syncToSalesforce(contact);
        default:
          return { success: false, error: 'Unsupported CRM type' };
      }
    } catch (error) {
      console.error('CRM sync error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async syncOpportunity(opportunity: CRMOpportunity, userId: string): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      switch (this.crmType) {
        case 'hubspot':
          return await this.syncOpportunityToHubSpot(opportunity);
        case 'gohighlevel':
          return await this.syncOpportunityToGoHighLevel(opportunity);
        case 'pipedrive':
          return await this.syncOpportunityToPipedrive(opportunity);
        case 'salesforce':
          return await this.syncOpportunityToSalesforce(opportunity);
        default:
          return { success: false, error: 'Unsupported CRM type' };
      }
    } catch (error) {
      console.error('CRM opportunity sync error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async syncToHubSpot(contact: CRMContact): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const hubspotContact = {
        properties: {
          firstname: contact.firstName,
          lastname: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
          industry: contact.industry,
          hs_lead_status: 'NEW',
          lifecyclestage: 'lead',
          lead_source: contact.source || 'SmartSend',
          notes_last_contacted: contact.notes,
          tags: contact.tags?.join(',')
        }
      };

      const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(hubspotContact)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HubSpot API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'HubSpot sync failed' };
    }
  }

  private async syncToGoHighLevel(contact: CRMContact): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const ghlContact = {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        companyName: contact.company,
        source: contact.source || 'SmartSend',
        tags: contact.tags,
        customFields: {
          industry: contact.industry,
          notes: contact.notes
        }
      };

      const response = await fetch(`${this.apiUrl}/v1/contacts/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ghlContact)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GoHighLevel API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.contact.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'GoHighLevel sync failed' };
    }
  }

  private async syncToPipedrive(contact: CRMContact): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const pipedrivePerson = {
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
        phone: contact.phone,
        org_name: contact.company,
        label: contact.industry,
        add_time: new Date().toISOString()
      };

      const response = await fetch('https://api.pipedrive.com/v1/persons', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pipedrivePerson)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pipedrive API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.data.id.toString() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Pipedrive sync failed' };
    }
  }

  private async syncToSalesforce(contact: CRMContact): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const salesforceContact = {
        FirstName: contact.firstName,
        LastName: contact.lastName,
        Email: contact.email,
        Phone: contact.phone,
        Company: contact.company,
        Industry: contact.industry,
        LeadSource: contact.source || 'SmartSend',
        Description: contact.notes
      };

      const response = await fetch(`${this.apiUrl}/services/data/v52.0/sobjects/Contact/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(salesforceContact)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Salesforce API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Salesforce sync failed' };
    }
  }

  private async syncOpportunityToHubSpot(opportunity: CRMOpportunity): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const hubspotDeal = {
        properties: {
          dealname: opportunity.name,
          dealstage: opportunity.stage,
          amount: opportunity.value?.toString(),
          closedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          pipeline: 'default',
          dealtype: 'newbusiness',
          source: opportunity.source || 'SmartSend',
          notes_last_contacted: opportunity.notes
        },
        associations: [
          {
            to: { id: opportunity.contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] // Contact to Deal
          }
        ]
      };

      const response = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(hubspotDeal)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HubSpot API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'HubSpot opportunity sync failed' };
    }
  }

  private async syncOpportunityToGoHighLevel(opportunity: CRMOpportunity): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const ghlOpportunity = {
        name: opportunity.name,
        contactId: opportunity.contactId,
        value: opportunity.value,
        stage: opportunity.stage,
        source: opportunity.source || 'SmartSend',
        notes: opportunity.notes
      };

      const response = await fetch(`${this.apiUrl}/v1/opportunities/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ghlOpportunity)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GoHighLevel API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.opportunity.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'GoHighLevel opportunity sync failed' };
    }
  }

  private async syncOpportunityToPipedrive(opportunity: CRMOpportunity): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const pipedriveDeal = {
        title: opportunity.name,
        person_id: opportunity.contactId,
        value: opportunity.value,
        stage_id: this.getPipedriveStageId(opportunity.stage),
        add_time: new Date().toISOString()
      };

      const response = await fetch('https://api.pipedrive.com/v1/deals', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pipedriveDeal)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Pipedrive API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.data.id.toString() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Pipedrive opportunity sync failed' };
    }
  }

  private async syncOpportunityToSalesforce(opportunity: CRMOpportunity): Promise<{ success: boolean; crmId?: string; error?: string }> {
    try {
      const salesforceOpportunity = {
        Name: opportunity.name,
        ContactId: opportunity.contactId,
        Amount: opportunity.value,
        StageName: opportunity.stage,
        LeadSource: opportunity.source || 'SmartSend',
        Description: opportunity.notes,
        CloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await fetch(`${this.apiUrl}/services/data/v52.0/sobjects/Opportunity/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(salesforceOpportunity)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Salesforce API error: ${error}`);
      }

      const data = await response.json();
      return { success: true, crmId: data.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Salesforce opportunity sync failed' };
    }
  }

  private getPipedriveStageId(stage: string): number {
    // This would need to be mapped based on your Pipedrive pipeline stages
    const stageMap: { [key: string]: number } = {
      'new': 1,
      'qualified': 2,
      'proposal': 3,
      'negotiation': 4,
      'closed-won': 5,
      'closed-lost': 6
    };
    return stageMap[stage.toLowerCase()] || 1;
  }

  async getCRMIntegration(userId: string): Promise<any> {
    const { data } = await supabase
      .from('crm_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    return data;
  }

  async updateLastSync(userId: string): Promise<void> {
    await supabase
      .from('crm_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId);
  }
}

export const createCRMSyncService = (crmType: string, apiKey: string, apiUrl?: string) => {
  return new CRMSyncService(crmType, apiKey, apiUrl);
};