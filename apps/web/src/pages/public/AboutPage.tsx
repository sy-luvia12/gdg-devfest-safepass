import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BadgeCheck,
  CalendarCog,
  Fingerprint,
  Lock,
  QrCode,
  ScanFace,
  Sheet,
  ShieldCheck,
  Ticket,
  UserCog,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Orb } from '@/components/Orb';

const PROBLEMS = [
  { value: '10만~50만 원', text: '재학생존 입장을 위해 학생증을 빌려주고 빌리는 가격' },
  { value: '암표 여전', text: '모바일 티켓으로 바꾼 학교도 산 사람과 들어오는 사람을 확인하지 못해요' },
  { value: '수작업', text: '학생회는 줄 세우기, 학생증 확인, 팔찌 배부, 구글폼·계좌이체 명단 관리까지' },
];

const SOLUTIONS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Ticket, title: '재학생 인증 입장권', text: '학교 계정으로 로그인하고 학생회 승인을 받은 재학생에게 1인 1매만 발급해요' },
  { icon: ScanFace, title: '본인 확인 검표', text: '30초마다 바뀌는 QR과 본인 사진을 함께 띄워요. 스태프는 얼굴만 대조하면 돼요' },
  { icon: ArrowLeftRight, title: '정가 양도', text: '못 가게 되면 다른 재학생에게 정가 이하로만 넘길 수 있어요. 웃돈 거래는 자동으로 막아요' },
];

const STAGES: { icon: LucideIcon; stage: string; blocks: string }[] = [
  { icon: Fingerprint, stage: '발급', blocks: '외부인, 매크로 사재기 → 학교 계정 + 학생회 승인 + 1인 1매' },
  { icon: ArrowLeftRight, stage: '거래', blocks: '웃돈 거래 → 정가 초과 양도는 시스템이 거부' },
  { icon: QrCode, stage: '입장', blocks: '캡처 화면, 학생증·계정 대여, 중복 입장 → 30초 QR + 사진 대조 + 1회용' },
];

const ONBOARDING: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BadgeCheck, title: '학교 도메인 등록', text: '학교 이메일 도메인으로만 로그인할 수 있게 설정해요' },
  { icon: CalendarCog, title: '행사 정보와 테마', text: '행사 정보를 넣고, 학교 상징색이나 포스터 색으로 화면을 꾸며요' },
  { icon: Sheet, title: '명단 연동 (선택)', text: '쓰던 구글 시트 명단을 불러와 명단에 있는 학생만 발급할 수 있어요' },
  { icon: UserCog, title: '검표 스태프 지정', text: '당일 검표할 학생회원의 계정에 검표 권한을 줘요' },
];

/** 학생회(구매 고객)와 심사위원을 위한 서비스 소개 */
export function AboutPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link to="/about" className="text-heading font-semibold text-ink">
            SafePass
          </Link>
          <Link to="/" className="text-label text-ink-2">
            데모 열기
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-16 px-5 pb-16 pt-12">
        <section className="flex flex-col items-center gap-8 text-center">
          <Orb size={180} />
          <div className="flex flex-col gap-3">
            <p className="text-label text-ink-2">대학 축제 재학생 인증 입장권</p>
            <h1 className="text-display text-ink md:text-[36px] md:leading-[46px]">
              학생증은 빌려줄 수 있어도,
              <br />내 계정과 내 얼굴은 빌려줄 수 없어요
            </h1>
            <p className="text-body text-ink-2">산 사람과 들어오는 사람이 같은지, SafePass가 확인해요</p>
          </div>
          <div className="w-full max-w-[320px]">
            <Button onClick={() => navigate('/')}>데모 시작하기</Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-title text-ink">축제 입장 자격이 거래되고 있어요</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <Card key={p.value} className="flex flex-col gap-2">
                <p className="text-title text-ink">{p.value}</p>
                <p className="text-caption text-ink-2">{p.text}</p>
              </Card>
            ))}
          </div>
          <p className="text-body text-ink-2">
            문제는 티켓의 모양이 아니라, <span className="text-ink">산 사람과 들어오는 사람이 같은지 확인하지 못하는 것</span>
            이에요.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-title text-ink">SafePass가 하는 일</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {SOLUTIONS.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="flex flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <p className="text-heading text-ink">{title}</p>
                <p className="text-caption text-ink-2">{text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-title text-ink">단계마다 막는 것</h2>
          <Card padded={false} className="divide-y divide-line">
            {STAGES.map(({ icon: Icon, stage, blocks }) => (
              <div key={stage} className="flex items-start gap-4 px-5 py-4">
                <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-2" />
                <div>
                  <p className="text-body text-ink">{stage}</p>
                  <p className="text-caption text-ink-2">{blocks}</p>
                </div>
              </div>
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-title text-ink">학생회 도입은 이렇게</h2>
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
          <p className="text-caption text-ink-2">
            당일에는 스태프 폰으로 검표하고, 학생회는 노트북에서 실시간 입장 인원을 정원과 비교해 확인해요.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-heading text-ink">
              <Lock size={18} strokeWidth={1.75} />
              개인정보는 최소로
            </p>
            <ul className="flex flex-col gap-1 text-caption text-ink-2">
              <li>· 이름, 학번, 학교 이메일, 사진만 수집</li>
              <li>· 얼굴 자동 인식 없이 스태프가 눈으로만 대조</li>
              <li>· 블록체인에는 입장권 번호만, 개인정보는 올리지 않음</li>
              <li>· 행사 종료 7일 뒤 사진·입장 기록 자동 삭제</li>
            </ul>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-heading text-ink">
              <ShieldCheck size={18} strokeWidth={1.75} />
              이용 요금
            </p>
            <ul className="flex flex-col gap-1 text-caption text-ink-2">
              <li>· 학생은 무료</li>
              <li>· 학생회는 행사 또는 학기 단위 이용료</li>
              <li>· 유료 티켓은 판매액의 1~3% 수수료</li>
            </ul>
          </Card>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-caption text-ink-3">
          <span>SafePass · 2026 DevFest 프로토타입</span>
          <span className="flex gap-4">
            <Link to="/terms">이용약관</Link>
            <Link to="/privacy">개인정보 처리방침</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
