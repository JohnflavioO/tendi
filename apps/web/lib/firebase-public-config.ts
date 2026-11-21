/**
 * Public Firebase Web App identifiers from the TendiDesk Firebase project.
 * These are not administrator credentials. Never put service-account secrets here.
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyC4tXVOLNaUPX71kExQxXbtvAtI-ZBnGmo',
  authDomain: 'tendidesk.firebaseapp.com',
  projectId: 'tendidesk',
  storageBucket: 'tendidesk.firebasestorage.app',
  messagingSenderId: '664651817116',
  appId: '1:664651817116:web:42329c95a7360f0f47cd59',
  measurementId: 'G-L3T44650H7',
} as const;

/** Public VAPID key used only to request a browser push subscription. */
export const FIREBASE_WEB_PUSH_VAPID_KEY =
  'BFbMIsGor27efFljXExAnznW6xJaKHctgnUK4_rumBdHFpshR2vAVz_KSKOSJWfAqqNyVrcwj9ka1PnN0oF5Iu4';
