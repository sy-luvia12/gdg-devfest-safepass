import { cx } from './cx';

const steps = ['학생 정보', '메일 인증', '본인 사진', '학생증'];

export function RegistrationSteps({ step }: { step: 0 | 1 | 2 | 3 }) {
  return (
    <div className="mb-8">
      <p className="mb-3 text-caption text-ink-2">{step + 1}/{steps.length}</p>
      <ol className="grid grid-cols-4 gap-2" aria-label="회원가입 단계">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index ? 'step' : undefined} className="flex flex-col gap-2">
            <span className={cx('h-1 rounded-full transition-colors duration-200', index <= step ? 'bg-lavender' : 'bg-surface')} />
            <span className={cx('text-caption', index === step ? 'text-ink' : 'text-ink-3')}>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
