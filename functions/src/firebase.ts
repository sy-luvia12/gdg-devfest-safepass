import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';

// onCall reads global options when each function is defined, so every handler imports this module first.
setGlobalOptions({ region: 'asia-northeast3' });

initializeApp();
export const db = getFirestore();
