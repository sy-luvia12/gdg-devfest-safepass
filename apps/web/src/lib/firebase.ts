// Firebase 초기화. 설정값은 .env.local의 VITE_FIREBASE_* (커밋하지 않는다).
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** 설정값이 없으면 mock으로 돈다 (lib/api.ts) */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

export const app = initializeApp(firebaseConfigured ? config : { apiKey: 'none', projectId: 'none', appId: 'none' });

// App Check는 사이트 키가 있을 때만 켠다. 다른 서비스가 첫 요청을 보내기 전에 초기화해야 토큰이 붙는다
const appCheckKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
if (firebaseConfigured && appCheckKey) {
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  if (import.meta.env.DEV && debugToken) {
    (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckKey), isTokenAutoRefreshEnabled: true });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
// 백엔드 함수는 서울 리전 (docs/api.md 0장)
export const functions = getFunctions(app, 'asia-northeast3');
