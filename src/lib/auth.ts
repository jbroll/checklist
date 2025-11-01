// This file is for server-side BetterAuth configuration
// It will be used when we set up the backend API
// For now, it's here as a reference

export const authConfig = {
  database: {
    // For now, we'll use a simple in-memory database for development
    // In production, you'll want to use a proper database adapter
    type: 'sqlite',
    url: './auth.db',
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: '', // Will be set from environment variables on server
      clientSecret: '',
    },
    apple: {
      clientId: '',
      clientSecret: '',
    },
  },
};
