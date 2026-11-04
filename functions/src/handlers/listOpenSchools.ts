import { onCall } from 'firebase-functions/v2/https';
import type { ListOpenSchoolsResponse } from '../api';
import { db } from '../firebase';
import { callableOptions } from './callableOptions';

// Sign-up school picker. Open to visitors who are not signed in: only names and mail domains, which are public.
export const listOpenSchools = onCall<unknown, Promise<ListOpenSchoolsResponse>>(callableOptions, async () => {
  const snap = await db.collection('schools').get();
  const schools = snap.docs
    .filter((d) => d.get('studentRoster'))
    .map((d) => ({ id: d.id, name: d.get('name') ?? '', domain: (d.get('domains') as string[] | undefined)?.[0] ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { schools };
});
