# SmartSend Mobile App

Mobile app for SmartSend Roofing - Field Mode + Push Notifications

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with your Supabase credentials:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_URL=your_api_url
```

3. Start the development server:
```bash
npm start
```

## Features

- **Field Mode Home Screen**: Dashboard with key metrics (hot leads, appointments, crew assignments, revenue)
- **Push Notifications**: Instant alerts for hot leads, booked appointments, crew assignments
- **Today's Schedule**: View and manage today's appointments with map integration
- **Hot Leads**: Quick reply tool for responding to hot leads instantly
- **Job Photo Upload**: Upload photos/videos from job sites
- **Offline Support**: Basic caching for offline usage

## Project Structure

```
smartsend-mobile/
├── app/
│   ├── (tabs)/          # Tab navigation screens
│   │   ├── home.tsx     # Field Mode home screen
│   │   ├── schedule.tsx # Today's schedule
│   │   ├── leads.tsx    # Hot leads screen
│   │   └── profile.tsx   # User profile
│   ├── login.tsx        # Login screen
│   └── upload-photos.tsx # Photo upload screen
├── lib/
│   ├── supabaseClient.ts # Supabase client with secure storage
│   └── notifications.ts  # Push notification setup
└── package.json
```

## Database Tables

The mobile app uses these tables:
- `device_tokens`: Stores Expo push notification tokens
- `job_media`: Stores uploaded photos/videos from job sites

## Push Notifications

Push notifications are automatically sent when:
- A hot lead is detected
- An appointment is booked
- A crew assignment is made
- Daily coaching tips are available

## Building for Production

### iOS
```bash
eas build --platform ios
```

### Android
```bash
eas build --platform android
```

## Notes

- Uses Expo Router for navigation
- Supabase for authentication and data storage
- Expo Notifications for push notifications
- Secure storage for authentication tokens


























