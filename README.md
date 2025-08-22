# SmartSend - AI-Powered Cold Email Generator

SmartSend is a micro-SaaS web application that uses OpenAI to generate compelling cold emails for businesses. Built with Next.js, Supabase, and Stripe.

## Features

- 🤖 **AI-Powered Email Generation**: Generate 3 unique cold email drafts using OpenAI
- 🎯 **Personalized Content**: Target specific audiences and industries
- 🎨 **Multiple Tones**: Choose from professional, casual, friendly, or formal tones
- 📧 **Email History**: Save and manage your generated emails
- 💳 **Subscription Management**: Free trial + $29/month Pro plan
- 🔐 **Secure Authentication**: Email-based auth with Supabase
- 📱 **Responsive Design**: Works on desktop and mobile

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: OpenAI GPT-4
- **Payments**: Stripe
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key
- Stripe account (for payments)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd smartsend-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key

   # Stripe Configuration
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

   # App Configuration
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Set up Supabase Database**
   
   Create the following tables in your Supabase database:

   ```sql
   -- Users table (extends Supabase auth.users)
   CREATE TABLE public.users (
     id UUID REFERENCES auth.users(id) PRIMARY KEY,
     email TEXT NOT NULL,
     subscription_status TEXT DEFAULT 'free',
     stripe_customer_id TEXT,
     email_credits INTEGER DEFAULT 5,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Email templates table
   CREATE TABLE public.email_templates (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
     target_audience TEXT NOT NULL,
     product_service TEXT NOT NULL,
     tone TEXT NOT NULL,
     generated_emails TEXT NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Subscriptions table
   CREATE TABLE public.subscriptions (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
     stripe_subscription_id TEXT UNIQUE NOT NULL,
     status TEXT NOT NULL,
     current_period_end TIMESTAMP WITH TIME ZONE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Enable Row Level Security
   ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

   -- Create policies
   CREATE POLICY "Users can view own profile" ON public.users
     FOR SELECT USING (auth.uid() = id);

   CREATE POLICY "Users can update own profile" ON public.users
     FOR UPDATE USING (auth.uid() = id);

   CREATE POLICY "Users can view own email templates" ON public.email_templates
     FOR ALL USING (auth.uid() = user_id);

   CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
     FOR ALL USING (auth.uid() = user_id);
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── auth/              # Auth callback
│   ├── dashboard/         # Dashboard pages
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Landing page
├── lib/                   # Utility libraries
│   ├── openai.ts          # OpenAI client
│   ├── supabase.ts        # Supabase client
│   ├── stripe.ts          # Stripe client
│   └── utils.ts           # Utility functions
└── types/                 # TypeScript types
    └── database.ts        # Database types
```

## Key Features Implementation

### Email Generation
- Uses OpenAI GPT-4 to generate 3 different cold email approaches
- Saves generated emails to Supabase database
- Supports multiple tones and target audiences

### Authentication
- Email-based authentication with Supabase
- Protected routes and API endpoints
- User session management

### Subscription Management
- Free trial with 5 email generations
- Pro plan with unlimited generations
- Stripe integration for payments

### Email History
- View all previously generated emails
- Copy emails to clipboard
- Delete unwanted templates

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Yes |
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key | Yes |
| `STRIPE_SECRET_KEY` | Your Stripe secret key | Yes |
| `STRIPE_WEBHOOK_SECRET` | Your Stripe webhook secret | Yes |
| `NEXT_PUBLIC_APP_URL` | Your app's URL | Yes |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support, email support@smartsend.ai or create an issue in this repository.

## Roadmap

- [ ] Advanced email templates
- [ ] Email analytics and tracking
- [ ] Bulk email generation
- [ ] Integration with email providers
- [ ] Team collaboration features
- [ ] API for third-party integrations
