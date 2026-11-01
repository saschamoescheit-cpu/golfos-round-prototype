import type { CapacitorConfig } from '@capacitor/cli';

// GolfOS as a native iOS app through TestFlight (Sascha 01.11.2026): the same Vite build as the website, in an app
// shell – so GPS and the shot by sound keep running with the screen locked. The bundle id can never change after
// the first upload.
const config: CapacitorConfig = {
  appId: 'de.moescheit.golfos',
  appName: 'GolfOS',
  webDir: 'dist',
  ios: {
    contentInset: 'never', // the app lays out the safe areas itself, as on the website
    backgroundColor: '#0E1418',
  },
  plugins: {
    // a notification arriving while the app is open is shown too (iOS hides it there otherwise)
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
