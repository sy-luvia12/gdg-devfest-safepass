import type { AppIcon } from '@/components/icons';
import { ListOrdered, QrCode, ScanFace, ShieldCheck, Smartphone, UserRound, Users } from '@/components/icons';

export const HIGHLIGHTS = ['학교 계정 1인 1매', '30초마다 바뀌는 QR', '사진으로 본인 확인'];

export const PROBLEMS = [
  { value: '암표 거래', text: '재학생 전용 입장권과 계정이 비싸게 되팔리고, 학생회는 막을 방법이 없어요' },
  { value: '학생증 대여', text: '입구에서 학생증 사진과 얼굴을 하나하나 대조하기 어려워 빌린 학생증으로 들어와요' },
  { value: '불투명한 운영', text: '취소표가 누구에게 갔는지, 지금 몇 명이 들어왔는지 학생들이 확인할 길이 없어요' },
];

/** 쓰는 사람별로 무엇을 하는지 */
export const ROLES: { icon: AppIcon; who: string; steps: string[] }[] = [
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

export const STRENGTHS: { icon: AppIcon; title: string; text: string }[] = [
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

export const DEMO = [
  '학교 계정 로그인 → 입장권 발급',
  '캡처한 QR 스캔 → 만료로 거부',
  '본인 QR 스캔 → 입장 성공, 관리자 화면 인원 즉시 증가',
  '같은 QR 다시 스캔 → 사용됨으로 거부',
  '입장권 취소 → 대기 명단 다음 학생에게 재배정',
];
