import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  CalendarCog,
  Fingerprint,
  ListOrdered,
  Lock,
  QrCode,
  Sheet,
  ShieldCheck,
  Smartphone,
  UserCog,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Orb } from '@/components/Orb';

const PROBLEMS = [
  { value: '수작업', text: '학생회는 줄 세우기, 학생증 확인, 팔찌 배부, 구글폼·계좌이체 명단 관리까지 손으로 해요' },
  { value: '불투명', text: '취소표가 누구에게 갔는지, 몇 명이 들어왔는지 학생들이 확인할 길이 없어요' },
  { value: '대여·거래', text: '학생증과 계정을 빌려주고 표를 사고파는 일이 반복돼요' },
];

const SOLUTIONS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Smartphone, title: '기기에 묶인 입장권', text: '학교 계정으로 1인 1매를 받고, 받은 기기에서만 30초마다 바뀌는 QR이 떠요' },
  { icon: ShieldCheck, title: '위조할 수 없는 기록', text: '입장권 번호와 발급·입장 기록을 블록체인에 남겨 진짜 표인지 누구나 확인할 수 있어요' },
  { icon: ListOrdered, title: '규칙대로 취소표 재배정', text: '양도 대신 취소만 있어요. 취소표는 학생회가 정한 순서나 추첨으로 대기자에게 가요' },
];

const STAGES: { icon: LucideIcon; stage: string; blocks: string }[] = [
  { icon: Fingerprint, stage: '발급', blocks: '학교 계정 + 1인 1매 + 기기 등록. 발급 기록은 블록체인에 남아요' },
  { icon: ListOrdered, stage: '취소', blocks: '개인 간 양도 없음. 취소표는 대기 명단 순서 또는 추첨으로만 재배정' },
  { icon: QrCode, stage: '입장', blocks: '30초 QR + 1회용. 캡처 화면과 중복 입장은 거부되고, 입장 인원은 실시간으로 집계' },
];

const ONBOARDING: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BadgeCheck, title: '학교 도메인 등록', text: '학교 이메일 도메인으로만 로그인할 수 있게 설정해요' },
  { icon: CalendarCog, title: '행사 정보와 테마', text: '행사 정보를 넣고, 학교 상징색이나 포스터 색으로 화면을 꾸며요' },
  { icon: Sheet, title: '명단 연동 (선택)', text: '쓰던 구글 시트 명단을 불러와 명단에 있는 학생만 발급할 수 있어요' },
  { icon: UserCog, title: '검표 스태프 지정', text: '당일 검표할 학생회원의 계정에 검표 권한을 줘요' },
];

/** 학생회(고객)와 심사위원을 위한 서비스 소개. 핵심 메시지는 운영 투명성과 신뢰성 */
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
            <p className="text-label text-ink-2">대학 축제 재학생 입장권</p>
            <h1 className="text-display text-ink md:text-[36px] md:leading-[46px]">
              학생회의 축제 운영을
              <br />투명하고 믿을 수 있게
            </h1>
            <p className="text-body text-ink-2">발급부터 취소표 재배정, 입장까지 모든 과정이 규칙대로 기록돼요</p>
          </div>
          <div className="w-full max-w-[320px]">
            <Button onClick={() => navigate('/')}>데모 시작하기</Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-title text-ink">축제 운영, 믿고 맡길 수 있나요?</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <Card key={p.value} className="flex flex-col gap-2">
                <p className="text-title text-ink">{p.value}</p>
                <p className="text-caption text-ink-2">{p.text}</p>
              </Card>
            ))}
          </div>
          <p className="text-body text-ink-2">
            필요한 건 거래를 완벽히 막는 기술이 아니라,{' '}
            <span className="text-ink">학생들이 운영을 믿을 수 있게 과정을 보여주는 것</span>이에요. 암표가 줄어드는 건 그
            결과예요.
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
          <h2 className="text-title text-ink">단계마다 남는 것</h2>
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
              <li>· 사진은 입장할 때 화면에 보여주기만 하고, 얼굴 자동 인식은 하지 않음</li>
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
