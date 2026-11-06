import type { ReactNode } from 'react';
import type { AppIcon } from '@/components/icons';
import { ListOrdered, Lock, QrCode, ScanFace, ShieldCheck, Smartphone, UserRound, Users } from '@/components/icons';
import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { PageAtmosphere } from '@/components/Orb';

/** 랜딩 위쪽 메뉴. 같은 화면 안의 구역으로 스크롤한다 */
const NAV = [
  { id: 'problem', label: '왜 필요한가' },
  { id: 'how', label: '작동 방식' },
  { id: 'why', label: 'Campass의 강점' },
  { id: 'demo', label: '데모 시나리오' },
];

const HIGHLIGHTS = ['학교 계정 1인 1매', '30초마다 바뀌는 QR', '사진으로 본인 확인'];

const PROBLEMS = [
  { value: '암표 거래', text: '재학생 전용 입장권과 계정이 비싸게 되팔리고, 학생회는 막을 방법이 없어요' },
  { value: '학생증 대여', text: '입구에서 학생증 사진과 얼굴을 하나하나 대조하기 어려워 빌린 학생증으로 들어와요' },
  { value: '불투명한 운영', text: '취소표가 누구에게 갔는지, 지금 몇 명이 들어왔는지 학생들이 확인할 길이 없어요' },
];

/** 쓰는 사람별로 무엇을 하는지 */
const ROLES: { icon: AppIcon; who: string; steps: string[] }[] = [
  {
    icon: UserRound,
    who: '학생',
    steps: ['학교 메일로 가입하면 재학생 명단과 대조해요', '입장권은 1인 1매, 받은 폰 하나에 묶여요', '입구에서 30초마다 바뀌는 QR을 보여줘요'],
  },
  {
    icon: ScanFace,
    who: '검표 스태프',
    steps: ['폰 카메라로 QR을 찍어요', '화면에 뜬 사진·이름·학번을 얼굴과 대조해요', '캡처한 QR, 이미 쓴 QR은 자동으로 거부돼요'],
  },
  {
    icon: Users,
    who: '학생회',
    steps: ['구글 시트로 명단과 대기 명단을 불러와요', '입장 인원을 정원과 비교해 실시간으로 봐요', '취소표는 정한 규칙(순서·추첨)대로 재배정돼요'],
  },
];

const STRENGTHS: { icon: AppIcon; title: string; text: string }[] = [
  {
    icon: Smartphone,
    title: '빌려줄 수 없는 입장권',
    text: '학교 계정, 등록된 폰, 본인 사진이 모두 맞아야 들어갈 수 있어요. 학생증만 빌려서는 입장할 수 없어요',
  },
  {
    icon: QrCode,
    title: '캡처해도 소용없는 QR',
    text: 'QR은 30초마다 바뀌고 한 번만 쓸 수 있어요. 캡처해서 넘긴 화면은 입구에서 만료로 거부돼요',
  },
  {
    icon: ShieldCheck,
    title: '누구나 확인하는 기록',
    text: '발급·입장·재배정 기록을 블록체인에 남겨요. 공개 현황판과 추첨 결과를 학생이 폰에서 직접 확인해요',
  },
  {
    icon: ListOrdered,
    title: '규칙대로 가는 취소표',
    text: '개인 간 양도는 없어요. 취소표는 대기 명단 순서나 추첨으로만 다음 학생에게 넘어가요',
  },
];

const DEMO = [
  '학교 계정 로그인 → 입장권 발급',
  '캡처한 QR 스캔 → 만료로 거부',
  '본인 QR 스캔 → 입장 성공, 관리자 화면 인원 즉시 증가',
  '같은 QR 다시 스캔 → 사용됨으로 거부',
  '입장권 취소 → 대기 명단 다음 학생에게 재배정',
];

/** Campass 소개(랜딩). 서비스 설명과 강점을 보여주고, 상단 "Campass 사용해보기"로 로그인 화면에 간다 */
export function AboutPage() {
  return (
    <div className="page-canvas">
      <PageAtmosphere />
      <header className="navigation-surface sticky top-4 z-20 mx-5 mt-5 rounded-[32px] md:mx-8">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 md:px-6">
          <Link to="/about" className="text-title text-ink">
            Campass
          </Link>
          <nav className="flex items-center gap-1 rounded-full bg-bg p-1 text-label">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="hidden rounded-full px-4 py-2 text-ink-2 hover:bg-surface lg:block">
                {n.label}
              </a>
            ))}
            <Link to="/" className="rounded-full bg-ink px-4 py-2 font-medium text-bg">
              Campass 사용해보기
            </Link>
          </nav>
        </div>
      </header>

      <main className="page-content">
        {/* 장식은 상단 배경으로 두고 기존 소개 콘텐츠를 유지한다. */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-16 md:min-h-[58vh] md:px-10 md:py-20">
          <div className="flex max-w-2xl flex-col gap-6">
            <p className="text-label text-ink-2">대학 축제 재학생 인증 입장권</p>
            <h1 className="break-keep text-[28px] font-semibold leading-[38px] text-ink md:text-[44px] md:leading-[58px]">
              학생증은 빌려줄 수 있어도,
              <br />내 계정과 내 얼굴은
              <br />빌려줄 수 없어요
            </h1>
            <p className="max-w-md text-body text-ink-2">
              Campass는 재학생만 축제에 들어올 수 있게 하는 입장권이에요. 학교 계정으로 1인 1매를 발급하고, 입구에서 QR과
              본인 사진으로 확인해요.
            </p>
            <ul className="flex flex-wrap gap-2">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="rounded-full bg-surface px-4 py-2 text-label text-ink">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Section id="problem" title="왜 필요한가" lead="대학 축제 입장권은 재학생에게만 가야 하지만, 지금 방식으로는 지키기 어려워요.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <Card key={p.value} className="flex flex-col gap-2 p-6">
                <p className="text-heading text-ink">{p.value}</p>
                <p className="text-label font-normal text-ink-2">{p.text}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="how" title="작동 방식" lead="학생은 폰 하나로, 스태프는 카메라 하나로, 학생회는 노트북 하나로 끝나요.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {ROLES.map(({ icon: Icon, who, steps }) => (
              <div key={who} className="flex flex-col gap-4 rounded-lg bg-surface p-6">
                <p className="flex items-center gap-2 text-heading text-ink">
                  <Icon size={20} strokeWidth={1.75} />
                  {who}
                </p>
                <ol className="flex flex-col gap-3">
                  {steps.map((s, i) => (
                    <li key={s} className="flex gap-3 text-label font-normal text-ink-2">
                      <span className="w-4 shrink-0 text-ink-3 tabular">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="why"
          title="Campass의 강점"
          lead="거래를 완벽히 막는 것보다, 학생들이 운영을 믿을 수 있게 과정을 보여주는 데 집중했어요."
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {STRENGTHS.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="flex flex-col gap-3 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <p className="text-heading text-ink">{title}</p>
                <p className="text-label font-normal text-ink-2">{text}</p>
              </Card>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-line p-5">
            <Lock size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-2" />
            <p className="text-label font-normal text-ink-2">
              <span className="font-medium text-ink">개인정보는 최소로.</span> 이름·학번·학교 메일·사진만 받고, 얼굴 자동
              인식은 하지 않아요. 블록체인에는 입장권 번호만 올리고, 사진과 입장 기록은 행사가 끝나면 지워요.
            </p>
          </div>
        </Section>

        <Section id="demo" title="데모 시나리오" lead="폰 두 대(학생·검표)와 노트북(관리자)으로 보면 가장 잘 보여요.">
          <Card className="p-6 md:p-8">
            <ol className="flex flex-col gap-3">
              {DEMO.map((d, i) => (
                <li key={d} className="flex gap-3 text-body text-ink-2">
                  <span className="w-5 shrink-0 text-ink-3 tabular">{i + 1}.</span>
                  <span>{d}</span>
                </li>
              ))}
            </ol>
          </Card>
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-8 text-caption text-ink-3 md:px-10">
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

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto flex max-w-6xl scroll-mt-24 flex-col gap-6 px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col gap-2">
        <h2 className="text-[24px] font-semibold leading-[32px] text-ink">{title}</h2>
        <p className="text-body text-ink-2">{lead}</p>
      </div>
      {children}
    </section>
  );
}
