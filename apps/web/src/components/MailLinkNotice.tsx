import { useEffect, useState } from 'react';
import { Mail } from '@/components/icons';
import { Link } from 'react-router-dom';
import { mockSignInLinkFor } from '@/lib/mock';
import { Button } from './Button';

export function MailLinkNotice({ email, sentAt, busy, onResend }: {
  email: string; sentAt: number; busy: boolean; onResend: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((sentAt + 60_000 - now) / 1000));
  return (
    <div className="student-auth-notice flex flex-col gap-5">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-2"><Mail size={24} strokeWidth={1.75} aria-hidden /></div>
      <h2 className="text-title text-ink">메일함을 확인해 주세요</h2>
      <p className="break-all text-body text-ink">{email}</p>
      <p role="status" className="text-body text-ink-2">인증 링크를 요청했어요. 받은 링크를 열면 이메일 확인과 로그인이 진행돼요. 스팸함도 확인해 주세요.</p>
      <p className="text-caption text-ink-2">회원가입 중이라면 메일을 요청한 브라우저에서 링크를 열어 주세요.</p>
      {__USE_MOCK__ && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-5">
          <p className="text-label text-ink-2">데모에서는 실제 메일이 발송되지 않아요. 아래 링크로 인증 흐름을 확인해 보세요.</p>
          <Link to={mockSignInLinkFor(email)} className="py-2 text-label text-link underline underline-offset-4">데모: 메일 링크 열기</Link>
        </div>
      )}
      <Button variant="secondary" loading={busy} disabled={remaining > 0} onClick={onResend}>
        {remaining > 0 ? `${remaining}초 후 다시 보내기` : '인증 메일 다시 보내기'}
      </Button>
    </div>
  );
}
