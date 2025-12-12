import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kjekit.app',
  appName: 'kjekit',
  webDir: 'dist',
  server: {
    // Use the production URL when running on device
    // For local development, use: url: 'http://YOUR_LOCAL_IP:8765'
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#76daDA',
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: true,
  },
};

export default config;
