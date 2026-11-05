import { useEffect, useRef, useState } from 'react';
import { Check, GraduationCap } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { AppHeader } from '@/components/AppHeader';
import { BottomBar, Button } from '@/components/Button';
import { cx } from '@/components/cx';
import { MailLinkNotice } from '@/components/MailLinkNotice';
import { RegistrationSteps } from '@/components/RegistrationSteps';
import { StateView } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { listOpenSchools, precheckStudent, sendSignInLink } from '@/lib/api';
import { studentAuthMessage, validateStudentFields, type StudentFieldErrors } from '@/lib/studentAuthForm';
import type { OpenSchool } from '@/types';

export function RegistrationPage() {
  const { user, loading } = useAuth();
  const [schools, setSchools] = useState<OpenSchool[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<'school' | 'identity' | 'email'>('school');
  const [schoolId, setSchoolId] = useState('');
  const [fields, setFields] = useState({ name: '', studentId: '', email: '' });
  const [errors, setErrors] = useState<StudentFieldErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [sentAt, setSentAt] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const school = schools?.find((item) => item.id === schoolId);

  useEffect(() => {
    let active = true;
    void listOpenSchools().then((items) => { if (active) setSchools(items); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { title.current?.focus(); }, [phase, schools]);
  const reload = () => {
    setLoadError(false);
    void listOpenSchools().then(setSchools).catch(() => setLoadError(true));
  };
  const send = async () => {
    if (lock.current || !school) return;
    const validation = validateStudentFields(fields, true);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    lock.current = true; setBusy(true); setError('');
    const input = { name: fields.name.normalize('NFC').trim(), studentId: fields.studentId.trim(), email: fields.email.trim().toLowerCase() };
    try {
      const match = await precheckStudent(input);
      if (match.schoolId !== school.id) { setError('선택한 학교와 이메일의 학교가 달라요. 학교 선택을 확인해 주세요.'); return; }
      await sendSignInLink(input.email, { schoolId: school.id, name: input.name, studentId: input.studentId });
      setFields(input); setSentAt(Date.now()); setPhase('email');
    } catch (cause) { setError(studentAuthMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  };

  if (loading) return <StateView kind="loading" fullScreen />;
  if (user) return <Navigate to="/" replace />;
  if (loadError) return <StateView kind="error" title="학교 목록을 불러오지 못했어요" action={<Button onClick={reload}>다시 시도하기</Button>} />;
  if (!schools) return <StateView kind="loading" fullScreen />;
  return (
    <>
      <AppHeader title="회원가입" back={busy ? undefined : '/'} />
      <main className="px-5 pb-44 pt-6 md:pb-10">
        <RegistrationSteps step={phase === 'email' ? 1 : 0} />
        <section key={phase} className="animate-rise-in">
          {phase === 'school' && (
            <>
              <h2 ref={title} tabIndex={-1} className="mb-2 text-title text-ink outline-none">학교를 선택해 주세요</h2>
              <p className="mb-8 text-body text-ink-2">재학 중인 학교를 선택하면 가입을 시작할 수 있어요.</p>
              {schools.length === 0 ? <StateView kind="empty" title="가입 가능한 학교가 아직 없어요" description="학교 담당자에게 학적 명단 등록을 문의해 주세요." /> : (
                <fieldset className="flex flex-col gap-3">
                  <legend className="sr-only">대학교 선택</legend>
                  {schools.map((item) => (
                    <label key={item.id} className={cx('flex min-h-24 cursor-pointer items-center gap-4 rounded-lg border p-4 transition duration-200 focus-within:ring-2 focus-within:ring-lavender', schoolId === item.id ? 'border-lavender bg-lavender/10' : 'border-line')}>
                      <input type="radio" name="school" className="sr-only" checked={schoolId === item.id} onChange={() => setSchoolId(item.id)} />
                      <GraduationCap size={24} strokeWidth={1.75} aria-hidden className="text-ink-2" />
                      <span className="flex-1 text-body text-ink">{item.name}</span>
                      {schoolId === item.id && <Check size={20} aria-hidden />}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}
          {phase === 'identity' && (
            <>
              <h2 ref={title} tabIndex={-1} className="mb-2 text-title text-ink outline-none">학생 정보를 확인할게요</h2>
              <p className="mb-6 text-body text-ink-2">{school?.name} 학적 명단에 등록된 정보를 입력해 주세요.</p>
              <form id="signup-info" noValidate onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex flex-col gap-6">
                <TextField label="이름" autoComplete="name" maxLength={100} value={fields.name} error={errors.name} disabled={busy} onChange={(event) => setFields({ ...fields, name: event.target.value })} />
                <TextField label="학번" inputMode="numeric" maxLength={40} value={fields.studentId} error={errors.studentId} disabled={busy} onChange={(event) => setFields({ ...fields, studentId: event.target.value })} />
                <TextField label="학교 이메일" type="email" autoComplete="email" autoCapitalize="none" maxLength={254} placeholder={`name@${school?.domain}`} value={fields.email} error={errors.email} disabled={busy} onChange={(event) => setFields({ ...fields, email: event.target.value })} hint="학적 명단에 등록된 이메일로 인증 링크를 보내요." />
              </form>
            </>
          )}
          {phase === 'email' && <MailLinkNotice email={fields.email} sentAt={sentAt} busy={busy} onResend={() => void send()} />}
          {error && <p role="alert" className="mt-5 rounded-md bg-danger-bg p-4 text-label text-danger">{error}</p>}
        </section>
        <BottomBar>
          {phase === 'school' && <Button disabled={!school} onClick={() => setPhase('identity')}>다음</Button>}
          {phase === 'identity' && <Button type="submit" form="signup-info" loading={busy}>학적 확인하고 인증 메일 받기</Button>}
          {phase !== 'school' && <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setPhase(phase === 'email' ? 'identity' : 'school'); }}>이전</Button>}
        </BottomBar>
      </main>
    </>
  );
}
