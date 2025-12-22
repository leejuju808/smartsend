-- Seed integration marketplace connectors
-- Run after revenue_growth_system migration

INSERT INTO public.integrations (service_name, display_name, description, category, is_active, icon_url) VALUES
  ('hubspot', 'HubSpot', 'Sync contacts and deals with HubSpot CRM', 'crm', true, 'https://cdn.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.svg'),
  ('slack', 'Slack', 'Get notifications in Slack when leads reply or convert', 'communication', true, 'https://a.slack-edge.com/80588/img/icons/favicon-32-32.png'),
  ('pipedrive', 'Pipedrive', 'Automatically create deals in Pipedrive from SmartSend campaigns', 'crm', true, 'https://www.pipedrive.com/favicon.ico'),
  ('telegram', 'Telegram', 'Receive SmartSend notifications via Telegram bot', 'communication', true, 'https://telegram.org/favicon.ico'),
  ('notion', 'Notion', 'Export contacts and campaign data to Notion databases', 'productivity', true, 'https://www.notion.so/images/favicon.ico')
ON CONFLICT (service_name) DO NOTHING;

