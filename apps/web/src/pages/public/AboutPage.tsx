import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { homePathFor } from '@/app/config';
import { ArrowRight, Lock, UserX, Search, Check, Info, LayoutGrid, Menu, ShieldCheck, Ticket, UserRound, X, type AppIcon } from '@/components/icons';
import { CrowdCanvas } from '@/components/CrowdCanvas';
import { HIGHLIGHTS, PROBLEMS, ROLES, STRENGTHS, DEMO } from './landingContent';

/** 공개 소개 화면에만 적용한다. 기존 로그인·회원가입 경로는 유지한다. */
export function AboutPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const adminLogin = async () => {
    setOpen(false);
    setBusy(true);
    setError('');
    try {
      const current = user ?? (await signIn()).user;
      navigate(current.operator ? '/ops' : homePathFor(current.role));
    } catch {
      setError('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="campass-landing">
      <section className="landing-first-screen" aria-labelledby="landing-title">
        <header className="landing-header">
          <Link to="/" aria-label="Campass 홈" className="landing-wordmark"><span>Cam</span><span>pass</span></Link>
          <div ref={menu} className="landing-menu">
            <nav id="landing-toolbar" aria-label="주 메뉴" className={`landing-toolbar ${open ? 'is-open' : ''}`}>
              <MenuLink icon={LayoutGrid} label="홈" to="/" close={() => setOpen(false)} index={0} />
              <MenuLink icon={Info} label="Campass 소개" to="#details" close={() => setOpen(false)} index={1} />
              <MenuLink icon={Ticket} label="축제 입장권" to="/events" close={() => setOpen(false)} index={2} />
              <button className="landing-tool" aria-label="관리자 로그인" onClick={adminLogin} disabled={busy} style={{ transitionDelay: open ? '105ms' : '0ms' }}>
                <UserRound size={20} /><span className="landing-tooltip">관리자 로그인</span>
              </button>
              <MenuLink icon={ShieldCheck} label="운영진" to={user?.operator ? '/ops' : '/ops/login'} close={() => setOpen(false)} index={4} />
            </nav>
            <button ref={toggle} type="button" className="landing-menu-toggle" aria-label={open ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={open} aria-controls="landing-toolbar" onClick={() => setOpen(!open)}>
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </header>
        <main className="landing-hero">
          <p className="landing-kicker">대학 축제 재학생 인증 입장권</p>
          <h1 id="landing-title">내 계정과 내 얼굴은<br /><span>빌려줄 수 없어요</span></h1>
          <p>학교 계정으로 1인 1매.<br />입구에서 QR과 본인 사진으로 확인해요.</p>
          <div className="landing-actions">
            <Link to="/" className="landing-primary">Campass 사용해보기 <ArrowRight size={18} /></Link>
            <a href="#details" className="landing-secondary">더 알아보기</a>
          </div>
          {error && <p role="alert" className="text-label text-danger">{error}</p>}
        </main>
        <div className="landing-crowd"><CrowdCanvas src="/images/peeps/all-peeps.png" rows={15} cols={7} /></div>
      </section>
      <div id="details" className="landing-story">
        <section className="landing-story-intro" aria-labelledby="story-title">
          <h2 id="story-title">학생증은 빌려줄 수 있어도,<br />내 계정과 내 얼굴은 빌려줄 수 없어요</h2>
          <p>Campass는 재학생만 축제에 들어올 수 있게 하는 입장권이에요. 학교 계정으로 1인 1매를 발급하고, 입구에서 QR과 본인 사진으로 확인해요.</p>
          <ul className="landing-highlights">{HIGHLIGHTS.map((text) => <li key={text}><Check size={18} aria-hidden="true" />{text}</li>)}</ul>
        </section>
        <nav className="landing-section-nav" aria-label="서비스 소개 목차">
          <a href="#problem">왜 필요한가</a><a href="#how">작동 방식</a><a href="#why">Campass의 강점</a><a href="#demo">데모 시나리오</a>
        </nav>
        <StorySection id="problem" title="왜 필요한가" lead="대학 축제 입장권은 재학생에게만 가야 하지만, 지금 방식으로는 지키기 어려워요.">
          <div className="landing-story-grid three-columns">{PROBLEMS.map((item, index) => {
            const Icon = [Ticket, UserX, Search][index];
            return <section key={item.value} className="landing-story-item"><Icon size={28} aria-hidden="true" /><h3>{item.value}</h3><p>{item.text}</p></section>;
          })}</div>
        </StorySection>
        <StorySection id="how" title="작동 방식" lead="학생은 폰 하나로, 스태프는 카메라 하나로, 학생회는 노트북 하나로 끝나요.">
          <div className="landing-story-grid three-columns">{ROLES.map(({ icon: Icon, who, steps }) => <section key={who} className="landing-story-item"><Icon size={28} aria-hidden="true" /><h3>{who}</h3><ol className="landing-role-steps">{steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section>)}</div>
        </StorySection>
        <StorySection id="why" title="Campass의 강점" lead="거래를 완벽히 막는 것보다, 학생들이 운영을 믿을 수 있게 과정을 보여주는 데 집중했어요.">
          <div className="landing-story-grid two-columns">{STRENGTHS.map(({ icon: Icon, title, text }) => <section key={title} className="landing-story-item"><Icon size={28} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></section>)}</div>
          <div className="landing-privacy"><Lock size={22} aria-hidden="true" /><p><span>개인정보는 최소로.</span> 이름·학번·학교 메일·사진만 받고, 얼굴 자동 인식은 하지 않아요. 블록체인에는 입장권 번호만 올리고, 사진과 입장 기록은 행사가 끝나면 지워요.</p></div>
        </StorySection>
        <StorySection id="demo" title="데모 시나리오" lead="폰 두 대(학생·검표)와 노트북(관리자)으로 보면 가장 잘 보여요.">
          <ol className="landing-demo-steps">{DEMO.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol>
          <Link to="/" className="landing-primary landing-demo-action">Campass 사용해보기 <ArrowRight size={18} /></Link>
        </StorySection>
      </div>
      <footer className="landing-footer">
        <span>Campass · 2026 DevFest 프로토타입</span>
        <div><Link to="/terms">이용약관</Link><Link to="/privacy">개인정보 처리방침</Link></div>
        <span className="landing-credits">일러스트: <a href="https://www.openpeeps.com/">Open Peeps</a> · 애니메이션: <a href="https://skiper-ui.com/">Skiper UI</a> / <a href="https://codepen.io/zadvorsky/pen/xxwbBQV">David</a></span>
      </footer>
    </div>
  );
}

function MenuLink({ icon: Icon, label, to, close, index }: { icon: AppIcon; label: string; to: string; close: () => void; index: number }) {
  const content = <><Icon size={20} /><span className="landing-tooltip">{label}</span></>;
  const props = { className: 'landing-tool', 'aria-label': label, onClick: close, style: { '--tool-delay': `${index * 35}ms` } as CSSProperties };
  return to.startsWith('#') ? <a href={to} {...props}>{content}</a> : <Link to={to} {...props}>{content}</Link>;
}

/** 원문을 읽기 쉬운 네 개의 구역으로 나눈다. */
function StorySection({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return <section id={id} className="landing-story-section" aria-labelledby={`${id}-title`}><header><h2 id={`${id}-title`}>{title}</h2><p>{lead}</p></header>{children}</section>;
}
