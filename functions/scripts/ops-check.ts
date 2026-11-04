// npm run test:seed: in the emulator after seed.ts: signs in as the operator with the id and password and reads rosters.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-ttv', apiKey: 'fake-api-key' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const functions = getFunctions(app, 'asia-northeast3');
connectFunctionsEmulator(functions, '127.0.0.1', 5001);
const call = (name: string, data?: unknown) => httpsCallable(functions, name)(data).then((r) => r.data as Record<string, unknown>);

async function main() {
  const wrong = await signInWithEmailAndPassword(auth, 'ops@ops.safepass.app', 'wrong-password').then(
    () => 'signed in',
    (e: { code?: string }) => e.code,
  );
  console.log('wrong password ->', wrong);
  await signInWithEmailAndPassword(auth, 'ops@ops.safepass.app', process.env.OPS_PASSWORD ?? '');
  const me = await call('ensureUser');
  console.log('ensureUser ->', JSON.stringify({ role: me.role, operator: me.operator, adminSchoolId: me.adminSchoolId ?? null }));
  for (const id of ['korea', 'yonsei', 'skku', 'kaist']) {
    const r = await call('opsListRoster', { kind: 'school', id });
    console.log(`school ${id} ->`, (r.rows as unknown[]).length, 'rows');
  }
  for (const id of ['demo-festival', 'korea-koyon', 'korea-seoktap', 'yonsei-akaraka', 'yonsei-yonko', 'skku-daedongje', 'kaist-taeul']) {
    const r = await call('opsListRoster', { kind: 'event', id });
    const rows = r.rows as { match: string }[];
    console.log(`event ${id} ->`, rows.length, 'rows,', rows.filter((x) => x.match === 'OK').length, 'match');
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
