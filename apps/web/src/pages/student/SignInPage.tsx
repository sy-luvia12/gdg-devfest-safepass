import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { MailLinkNotice } from '@/components/MailLinkNotice';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { precheckStudent, sendSignInLink } from '@/lib/api';
import { enterDemo, findDemoLogin } from '@/lib/demo';
import { studentAuthMessage, validateStudentFields, type StudentFieldErrors } from '@/lib/studentAuthForm';

export function SignInPage() {
  const { user, loading } = useAuth();
  const [fields, setFields] = useState({ name: '', studentId: '', email: '' });
  const [errors, setErrors] = useState<StudentFieldErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [sentAt, setSentAt] = useState(0);
  const send = async () => {
    if (lock.current) return;
    const validation = validateStudentFields(fields, false);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    // 데모 계정이면 메일 인증 없이 이 브라우저만 데모 모드로 들어간다 (lib/demo.ts)
    const demo = findDemoLogin(fields.studentId, fields.email);
    if (demo) { lock.current = true; setBusy(true); enterDemo(demo.uid); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const email = fields.email.trim().toLowerCase();
      await precheckStudent({ email, studentId: fields.studentId.trim() });
      await sendSignInLink(email);
      setFields({ ...fields, email }); setSentAt(Date.now());
    } catch (cause) { setError(studentAuthMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  };
  if (loading) return <StateView kind="loading" fullScreen />;
  if (user) return <Navigate to="/" replace />;
  return (
    <>
      <AppHeader title="로그인" back={busy ? undefined : '/'} />
      <main className="px-6 pb-6 pt-8">
        {sentAt ? <MailLinkNotice email={fields.email} sentAt={sentAt} busy={busy} onResend={() => void send()} /> : (
          <section className="surface-card animate-rise-in rounded-lg p-5">
            <h2 className="mb-2 text-title text-ink">학교 메일로 로그인해요</h2>
            <p className="mb-8 text-body text-ink-2">가입한 학번과 이메일로 인증 링크를 받아 주세요.</p>
            <form id="student-signin" noValidate onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex flex-col gap-6">
              <TextField label="학번" inputMode="numeric" maxLength={40} value={fields.studentId} error={errors.studentId} disabled={busy} onChange={(event) => setFields({ ...fields, studentId: event.target.value })} />
              <TextField label="학교 이메일" type="email" autoComplete="email" autoCapitalize="none" maxLength={254} value={fields.email} error={errors.email} disabled={busy} onChange={(event) => setFields({ ...fields, email: event.target.value })} />
            </form>
            <p className="mt-6 text-label text-ink-2">아직 계정이 없으신가요? <Link to="/signup" className="text-link underline underline-offset-4">회원가입 하러가기</Link></p>
          </section>
        )}
        {error && <p role="alert" className="mt-5 rounded-md bg-danger-bg p-4 text-label text-danger">{error}</p>}
      </main>
      <BottomBar>
        {!sentAt && <Button type="submit" form="student-signin" loading={busy}>인증 메일 받기</Button>}
        {!!sentAt && <Button variant="ghost" disabled={busy} onClick={() => { setSentAt(0); setError(''); }}>입력 정보 수정하기</Button>}
      </BottomBar>
    </>
  );
}
