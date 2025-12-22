-- Example SMTP settings to insert (for quick test)
-- Use app passwords for Gmail (recommended for MVP) or a generic SMTP (Mailersend, Brevo, etc.)

-- Example 1: Gmail with app password
-- Replace <ACCOUNT_UUID> with your actual connected_accounts.id
-- Replace 'yourmailbox@gmail.com' and 'xxxxxxxxxxxxxx' with your Gmail and app password
/*
update public.connected_accounts
set provider = 'gmail',
    smtp_settings = jsonb_build_object(
      'host','smtp.gmail.com',
      'port',587,
      'secure', false,
      'user','yourmailbox@gmail.com',
      'pass','xxxxxxxxxxxxxx',           -- app password
      'from','Your Name <yourmailbox@gmail.com>'
    )
where id = '<ACCOUNT_UUID>';
*/

-- Example 2: Generic SMTP TLS:465
-- Replace <ACCOUNT_UUID> with your actual connected_accounts.id
/*
update public.connected_accounts
set provider = 'smtp',
    smtp_settings = jsonb_build_object(
      'host','smtp.yourdomain.com',
      'port',465,
      'secure', true,
      'user','mailer@yourdomain.com',
      'pass','supersecret',
      'from','SmartSend ⚡ <mailer@yourdomain.com>'
    )
where id = '<ACCOUNT_UUID>';
*/

-- Example 3: Outlook with app password
/*
update public.connected_accounts
set provider = 'outlook',
    smtp_settings = jsonb_build_object(
      'host','smtp-mail.outlook.com',
      'port',587,
      'secure', false,
      'user','yourmailbox@outlook.com',
      'pass','xxxxxxxxxxxxxx',           -- app password
      'from','Your Name <yourmailbox@outlook.com>'
    )
where id = '<ACCOUNT_UUID>';
*/

-- Example 4: Gmail via OAuth2 (OAuth tokens in smtp_settings.oauth)
-- For OAuth2 Gmail, set smtp_settings.oauth instead of pass:
/*
update public.connected_accounts
set provider = 'gmail',
    smtp_settings = jsonb_build_object(
      'host','smtp.gmail.com',
      'port',465,
      'secure',true,
      'from','you@gmail.com',
      'oauth', jsonb_build_object(
        'type','OAuth2',
        'user','you@gmail.com',
        'clientId','...',
        'clientSecret','...',
        'refreshToken','...',
        'accessToken','...'
      )
    )
where id = '<ACCOUNT_UUID>';
*/
