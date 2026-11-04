import { defineBoolean } from 'firebase-functions/params';

// Off until the web app sends App Check tokens, so existing clients keep working. Flip it per deploy.
const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', { default: false });

export const callableOptions = { enforceAppCheck: ENFORCE_APP_CHECK };
