import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCog,
  ListOrdered,
  Lock,
  Receipt,
  Sheet,
  ShieldCheck,
  Smartphone,
  UserCog,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Orb } from '@/components/Orb';

/** 랜딩 위쪽 메뉴. 같은 화면 안의 구역으로 스크롤한다 */
const NAV = [
  { id: 'problem', label: '왜 필요한가' },
  { id: 'how', label: '작동 방식' },
  { id: 'demo', label: '데모 시나리오' },
];

const PROBLEMS = [
  { value: '암표 거래', text: '재학생 전용 입장권과 계정이 비싸게 되팔리고, 학생회는 막을 방법이 없어요' },
  { value: '학생증 대여', text: '입구에서 학생증 사진과 얼굴을 하나하나 대조하기 어려워 빌린 학생증으로 들어와요' },
  { value: '불투명한 운영', text: '취소표가 누구에게 갔는지, 지금 몇 명이 들어왔는지 학생들이 확인할 길이 없어요' },
];

const STEPS = [
  { title: '학교 계정 가입', text: '재학생 명단과 이름·학번·학교 메일을 대조해요' },
  { title: '1인 1매 발급', text: '입장권은 받은 기기 하나에 묶여요' },
  { title: '30초 QR', text: 'QR이 30초마다 바뀌어 캡처한 화면은 만료돼요' },
  { title: '사진 대조 입장', text: '스태프가 사진·이름·학번을 보고, 입장 인원은 바로 반영돼요' },
];

const SOLUTIONS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Smartphone, title: '기기에 묶인 입장권', text: '학교 계정으로 1인 1매를 받고, 받은 기기에서만 QR이 떠요' },
  { icon: ShieldCheck, title: '위조할 수 없는 기록', text: '발급·입장 기록을 블록체인에 남겨 진짜 표인지 누구나 확인할 수 있어요' },
  { icon: ListOrdered, title: '규칙대로 취소표 재배정', text: '양도 대신 취소만 있어요. 취소표는 정해진 순서나 추첨으로 대기자에게 가요' },
];

const DEMO = [
  '학교 계정 로그인 → 입장권 발급',
  '캡처한 QR 스캔 → 만료로 거부',
  '본인 QR 스캔 → 입장 성공, 관리자 화면 인원 즉시 증가',
  '같은 QR 다시 스캔 → 사용됨으로 거부',
  '입장권 취소 → 대기 명단 다음 학생에게 재배정',
];

const ONBOARDING: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BadgeCheck, title: '학교 도메인 등록', text: '학교 이메일 도메인으로만 로그인할 수 있게 설정해요' },
  { icon: CalendarCog, title: '행사 정보와 테마', text: '행사 정보를 넣고, 학교 상징색이나 포스터 색으로 화면을 꾸며요' },
  { icon: Sheet, title: '명단 연동 (선택)', text: '쓰던 구글 시트 명단을 불러와 명단에 있는 학생만 발급할 수 있어요' },
  { icon: UserCog, title: '검표 스태프 지정', text: '당일 검표할 학생회원의 계정에 검표 권한을 줘요' },
];

/** Campass 소개(랜딩). 학생회(고객)와 심사위원이 먼저 보고, "Campass 사용해보기"로 로그인 화면에 간다 */
export function AboutPage() {
  const navigate = useNavigate();
  const tryIt = () => navigate('/');

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 md:px-6">
          <Link to="/about" className="text-title text-ink">
            Campass
          </Link>
          <nav className="flex items-center gap-1 rounded-full border border-line bg-bg/80 p-1 text-label">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="hidden rounded-full px-4 py-2 text-ink-2 hover:bg-surface md:block">
                {n.label}
              </a>
            ))}
            <Link to="/" className="rounded-full bg-ink px-4 py-2 font-medium text-bg">
              Campass 사용해보기
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* 히어로: 그라데이션 포인트는 오른쪽 구 하나 */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:min-h-[78vh] md:grid-cols-[1.1fr_1fr] md:px-6 md:py-12">
          <div className="order-2 flex flex-col gap-6 md:order-1">
            <p className="text-label text-ink-2">대학 축제 재학생 인증 입장권</p>
            <h1 className="break-keep text-[28px] font-semibold leading-[38px] text-ink md:text-[44px] md:leading-[58px]">
              학생증은 빌려줄 수 있어도,
              <br />내 계정과 내 얼굴은
              <br />빌려줄 수 없어요
            </h1>
            <p className="max-w-md text-body text-ink-2">
              학교 계정으로 1인 1매를 발급하고, 30초마다 바뀌는 QR과 본인 사진으로 검표해요. 암표와 학생증 대여를 입구에서
              막아요.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="w-auto px-7" onClick={tryIt}>
                Campass 사용해보기
              </Button>
              <Button variant="ghost" className="w-auto px-5" onClick={() => scrollToId('how')}>
                어떻게 동작하나요
              </Button>
            </div>
          </div>
          <div className="order-1 flex justify-center md:order-2">
            <Orb size={220} className="md:hidden" />
            <Orb size={380} className="hidden md:flex" />
          </div>
        </section>

        <Section id="problem" title="왜 필요한가">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <Card key={p.value} className="flex flex-col gap-2 p-6">
                <p className="text-heading text-ink">{p.value}</p>
                <p className="text-label font-normal text-ink-2">{p.text}</p>
              </Card>
            ))}
          </div>
          <p className="text-body text-ink-2">
            필요한 건 거래를 완벽히 막는 기술이 아니라,{' '}
            <span className="text-ink">학생들이 운영을 믿을 수 있게 과정을 보여주는 것</span>이에요.
          </p>
        </Section>

        <Section id="how" title="작동 방식">
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2 rounded-lg bg-surface p-6">
                <span className="text-label text-ink-3 tabular">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-heading text-ink">{s.title}</p>
                <p className="text-label font-normal text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {SOLUTIONS.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="flex flex-col gap-3 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <p className="text-heading text-ink">{title}</p>
                <p className="text-label font-normal text-ink-2">{text}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="demo" title="데모 시나리오">
          <Card className="flex flex-col gap-6 p-6 md:p-8">
            <ol className="flex flex-col gap-3">
              {DEMO.map((d, i) => (
                <li key={d} className="flex gap-3 text-body text-ink-2">
                  <span className="w-5 shrink-0 text-ink-3 tabular">{i + 1}.</span>
                  <span>{d}</span>
                </li>
              ))}
            </ol>
            <p className="text-caption text-ink-3">폰 두 대(학생·검표)와 노트북(관리자)으로 보면 가장 잘 보여요.</p>
            <Link to="/" className="inline-flex items-center gap-1 self-start text-label text-link">
              Campass 사용해보기
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          </Card>
        </Section>

        <Section id="adopt" title="학생회 도입은 이렇게">
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ONBOARDING.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4 rounded-lg border border-line p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-label text-ink tabular">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-2 text-body text-ink">
                    <Icon size={16} strokeWidth={1.75} className="text-ink-2" />
                    {title}
                  </p>
                  <p className="text-caption text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-heading text-ink">
                <Lock size={18} strokeWidth={1.75} />
                개인정보는 최소로
              </p>
              <ul className="flex flex-col gap-1 text-caption text-ink-2">
                <li>· 이름, 학번, 학교 이메일, 사진만 수집</li>
                <li>· 사진은 입장할 때 화면에 보여주기만 하고, 얼굴 자동 인식은 하지 않음</li>
                <li>· 블록체인에는 입장권 번호만, 개인정보는 올리지 않음</li>
                <li>· 행사 종료 7일 뒤 사진·입장 기록 자동 삭제</li>
              </ul>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-heading text-ink">
                <Receipt size={18} strokeWidth={1.75} />
                이용 요금
              </p>
              <ul className="flex flex-col gap-1 text-caption text-ink-2">
                <li>· 학생은 무료</li>
                <li>· 학생회는 행사 또는 학기 단위 이용료</li>
                <li>· 유료 티켓은 판매액의 1~3% 수수료</li>
              </ul>
            </Card>
          </div>
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-8 text-caption text-ink-3 md:px-6">
          <span>Campass · 2026 DevFest 프로토타입</span>
          <span className="flex gap-4">
            <Link to="/terms">이용약관</Link>
            <Link to="/privacy">개인정보 처리방침</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-6 px-5 py-14 md:px-6 md:py-20">
      <h2 className="text-[24px] font-semibold leading-[32px] text-ink">{title}</h2>
      {children}
    </section>
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}
