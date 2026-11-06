import { AppHeader } from '@/components/AppHeader';

type Section = { title: string; body: string[] };

const TERMS: Section[] = [
  {
    title: '1. 서비스',
    body: ['Campass는 대학 행사 주최 측(학생회)이 재학생에게 입장권을 발급하고 입장을 확인하는 서비스예요.'],
  },
  {
    title: '2. 입장권',
    body: [
      '입장권은 학교 계정 1개당 1매만 받을 수 있어요.',
      '입장권은 받은 기기에 등록돼요. 등록한 기기와 본인 계정에서만 쓸 수 있어요.',
      '캡처한 QR, 다른 사람의 계정으로 띄운 QR은 쓸 수 없어요.',
    ],
  },
  {
    title: '3. 취소와 재배정',
    body: [
      '입장권은 다른 사람에게 직접 넘길 수 없어요.',
      '못 가게 되면 입장권을 취소할 수 있어요. 이미 입장에 쓴 입장권은 취소할 수 없어요.',
      '취소한 입장권은 주최 측이 정한 방식(대기 순서 또는 무작위)으로 대기 명단의 재학생에게 배정돼요. 취소는 되돌릴 수 없어요.',
    ],
  },
  {
    title: '4. 이용 제한',
    body: ['재학생이 아닌 사람이 쓰거나, 입장권을 사고팔아 이득을 얻으려 하면 주최 측이 이용을 막을 수 있어요.'],
  },
];

const PRIVACY: Section[] = [
  {
    title: '1. 모으는 정보',
    body: ['이름, 학번, 학교 이메일, 본인 얼굴 사진, 학생증 사진, 입장 기록, 등록 기기 정보'],
  },
  {
    title: '2. 쓰는 곳',
    body: [
      '재학생 확인과 입장권 발급',
      '입장할 때 검표 화면에 본인 사진 표시',
      '학생회의 실시간 입장 인원 파악(정원 초과·밀집 방지)',
      '취소표 재배정 (대기 명단)',
    ],
  },
  {
    title: '3. 볼 수 있는 사람',
    body: [
      '본인 사진: 본인, 해당 행사 검표 스태프와 학생회 (입장 순간에만 표시, 스태프 기기에 저장하지 않음)',
      '학생증 사진: 해당 학교 학생회만',
      '얼굴 자동 인식이나 비교는 하지 않아요.',
    ],
  },
  {
    title: '4. 보관 기간',
    body: [
      '행사가 끝나고 7일 뒤 사진, 입장 기록, 명단을 자동으로 지워요.',
      '블록체인에는 입장권 번호와 지갑 주소만 남고, 개인정보는 올리지 않아요.',
    ],
  },
  {
    title: '5. 문의',
    body: ['개인정보 열람·삭제 요청은 행사를 주최한 학생회에 하면 돼요.'],
  },
];

/** 이용약관 · 개인정보 처리방침 (프로토타입 초안) */
export function PolicyPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const sections = kind === 'terms' ? TERMS : PRIVACY;
  return (
    <>
      <AppHeader title={kind === 'terms' ? '이용약관' : '개인정보 처리방침'} back />
      <main className="flex flex-col gap-6 px-6 pb-12 pt-2">
        <p className="rounded-md bg-surface px-4 py-3 text-caption text-ink-2">
          해커톤 프로토타입용 초안이에요. 실제 서비스 전에 학교·학생회와 함께 다듬어야 해요.
        </p>
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2">
            <h2 className="text-heading text-ink">{s.title}</h2>
            <ul className="flex flex-col gap-1.5">
              {s.body.map((b) => (
                <li key={b} className="text-body text-ink-2">
                  {b}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
