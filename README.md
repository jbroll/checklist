# GroceryList - Collaborative Shopping Lists

A real-time collaborative grocery list application built with Jazz.tools and BetterAuth.

## Features

- 🔐 **Multi-provider OAuth**: Sign in with Google or Apple
- 🔄 **Real-time Sync**: Changes sync instantly across all devices
- 📱 **Offline-First**: Works without internet, syncs when connected
- 🔒 **End-to-End Encrypted**: Your data is secure with Jazz's encryption
- 👥 **Collaborative**: Share lists with family and friends
- 📝 **Smart Categories**: Auto-categorize items (Produce, Dairy, Meat, etc.)
- ✅ **Shopping Mode**: Optimized UI for checking off items in-store

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Database**: Jazz.tools (distributed, real-time sync)
- **Authentication**: BetterAuth with Jazz plugin (Google + Apple OAuth)
- **Styling**: Tailwind CSS + Radix UI
- **Animation**: Framer Motion

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Google OAuth credentials (for Google sign-in)
- Apple OAuth credentials (for Apple sign-in)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd groceries-jazz
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your OAuth credentials:
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
APPLE_CLIENT_ID=your_apple_client_id
APPLE_CLIENT_SECRET=your_apple_client_secret
VITE_API_URL=http://localhost:3000
VITE_JAZZ_PEER=wss://cloud.jazz.tools
```

### OAuth Setup

#### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:5173/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)

#### Apple OAuth

1. Go to [Apple Developer](https://developer.apple.com/)
2. Register a new identifier for Sign in with Apple
3. Create a Service ID
4. Configure Sign in with Apple
5. Add return URLs:
   - `http://localhost:5173/api/auth/callback/apple` (development)
   - `https://yourdomain.com/api/auth/callback/apple` (production)

### Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
groceries-jazz/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # Base UI components (Radix UI)
│   │   ├── lists/          # List-specific components
│   │   ├── items/          # Item-specific components
│   │   ├── categories/     # Category components
│   │   └── layout/         # Layout components
│   ├── schemas/            # Jazz CoValue schemas
│   │   └── index.ts        # GroceryList & GroceryItem schemas
│   ├── lib/                # Utilities and configuration
│   │   ├── auth.ts         # BetterAuth server config
│   │   ├── auth-client.ts  # BetterAuth client
│   │   ├── jazz.tsx        # Jazz provider setup
│   │   └── utils.ts        # Helper functions
│   ├── hooks/              # Custom React hooks
│   ├── App.tsx             # Main app component
│   ├── main.tsx            # App entry point
│   └── index.css           # Global styles
├── public/                 # Static assets
├── .env.example            # Example environment variables
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite configuration
└── tailwind.config.js      # Tailwind CSS configuration
```

## Jazz Schemas

The app uses two main Jazz CoValue schemas:

### GroceryList
```typescript
{
  name: string
  items: CoList<GroceryItem>
  owner: Account
  group: Group
  archived: boolean
  createdAt: Date
  updatedAt: Date
}
```

### GroceryItem
```typescript
{
  name: string
  quantity?: string
  notes?: string
  category: Category
  checked: boolean
  archived: boolean
  addedBy: Account
  checkedBy?: Account
  createdAt: Date
  updatedAt: Date
}
```

## How It Works

### Authentication Flow

1. User clicks "Continue with Google" or "Continue with Apple"
2. BetterAuth handles OAuth flow
3. Jazz plugin stores user's account keys with BetterAuth
4. User is authenticated and can access Jazz data

### Data Sync

1. All changes are automatically synced via Jazz.tools
2. Data is stored in encrypted CoValues
3. Works offline - syncs when connection restored
4. Real-time updates across all devices

### Sharing Lists

1. Lists have a Group that controls access
2. Owner can invite others to the group
3. Group members get real-time access to the list
4. Permissions managed via Jazz Groups

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## Deployment

### Frontend

Deploy to Vercel, Netlify, or any static hosting:

```bash
npm run build
# Upload dist/ folder to your hosting provider
```

### Backend (BetterAuth)

The BetterAuth server needs to be deployed separately. Options:

1. **Vercel/Netlify Functions**: Deploy as serverless functions
2. **Railway/Render**: Deploy as a Node.js app
3. **Self-hosted**: Run on your own server

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes (for Google auth) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Yes (for Google auth) |
| `APPLE_CLIENT_ID` | Apple OAuth client ID | Yes (for Apple auth) |
| `APPLE_CLIENT_SECRET` | Apple OAuth client secret | Yes (for Apple auth) |
| `VITE_API_URL` | BetterAuth API URL | Yes |
| `VITE_JAZZ_PEER` | Jazz sync server URL | No (defaults to cloud.jazz.tools) |

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [Jazz.tools](https://jazz.tools/) - The database that syncs
- [BetterAuth](https://better-auth.com/) - Authentication framework
- [Radix UI](https://www.radix-ui.com/) - Accessible component primitives
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

## Support

For issues and questions:
- Check the [Jazz.tools documentation](https://jazz.tools/docs)
- Check the [BetterAuth documentation](https://better-auth.com/docs)
- Open an issue in this repository

---

Built with ❤️ using Jazz.tools and BetterAuth
