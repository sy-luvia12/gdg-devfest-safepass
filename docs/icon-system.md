# Nucleo Glass 아이콘 시스템

모든 기능 아이콘은 공식 `nucleo-glass@1.4.1` React SVG로 통일한다. 기존 버튼·페이지 동작, 레이블, 인증·API는 바꾸지 않는다. 사진·QR·로고는 기능 아이콘과 구분하며 기존 자산을 유지한다.

## 출처와 사용 조건

- 공식 무료 아이콘 안내: https://nucleoapp.com/free-icons
- 패키지: https://www.npmjs.com/package/nucleo-glass
- 라이선스: https://nucleoapp.com/license
- Glass는 공식 무료 컬렉션이다. 앞서 별도 구매가 반드시 필요하다고 판단한 내용은 이 컬렉션에는 적용하지 않는다.
- 이 프로젝트는 아래에 나열한 59종의 원본 Glass 모티프를 사용한다. 전체 라이브러리나 원본 SVG 파일 묶음을 재배포하지 않는다.

## 구현

- `components/icons.tsx`: 기존 의미 이름과 실제 SVG 연결. 모든 호출부는 이 공통 진입점만 사용한다.
- 인스턴스마다 `useId`로 SVG gradient/filter/mask의 참조를 분리한다.
- 상태색은 `currentColor`로 상속한다. 원래 Glass 기하 구조와 반투명 레이어는 유지한다.
- 로딩 회전 클래스, 클릭 콜백, 버튼 크기·접근성 레이블은 유지한다.
- 정확히 같은 도형이 없는 QR·보안·닫기·추가 등은 같은 Glass 컬렉션의 가까운 모티프로 대응한다. 텍스트와 접근성 레이블은 실제 동작을 계속 설명한다.

## 대응표

| 기존 의미 | Nucleo Glass 원본 |
|---|---|
| AlertCircle | IconCircleInfo |
| ArrowRight | IconArrowBoldRight |
| BarChart3 | IconChartBar |
| Blocks | IconAppStack |
| Calendar | IconCalendar |
| CalendarDays | IconCalendar |
| CalendarPlus | IconCalendar |
| Camera | IconCamera |
| CameraOff | IconEyeClosed |
| Check | IconCircleCheck |
| CheckCircle2 | IconCircleCheck |
| ChevronDown | IconArrowBoldDown |
| ChevronLeft | IconArrowBoldLeft |
| ChevronRight | IconArrowBoldRight |
| Circle | IconProgressCircle |
| CircleCheck | IconCircleCheck |
| CirclePause | IconProgressBar |
| CircleX | IconBan |
| ClipboardList | IconTasks |
| ClipboardPaste | IconClipboard |
| Clock | IconDial |
| Copy | IconCopies |
| CopyX | IconTabClose |
| Dices | IconShapes |
| Download | IconFileDownload |
| ExternalLink | IconOpenInBrowser |
| FileSpreadsheet | IconSquareGrid |
| FileText | IconFile |
| GraduationCap | IconGreekTemple |
| HelpCircle | IconCircleQuestion |
| History | IconTimelineVertical |
| ImageOff | IconEyeClosed |
| ImageUp | IconImage |
| Inbox | IconInbox |
| Info | IconCircleInfo |
| Keyboard | IconKeyboard |
| LayoutDashboard | IconRectLayoutGrid |
| LayoutGrid | IconGrid2 |
| LayoutList | IconBulletList |
| Link2 | IconLink |
| ListOrdered | IconTasks |
| Loader2 | IconLoader2 |
| Lock | IconLock |
| LogOut | IconCirclePowerOff |
| Mail | IconEnvelope |
| MapPin | IconLocation |
| Menu | IconBulletList |
| Package | IconBox |
| Palette | IconColorPalette |
| Pencil | IconPen |
| Percent | IconCircleCoin |
| Plus | IconCircleCopyPlus |
| QrCode | IconCrosshairs |
| RefreshCw | IconRefresh |
| RotateCcw | IconRefresh |
| ScanFace | IconUser |
| ScanLine | IconCrosshairs |
| School | IconGreekTemple |
| Search | IconMagnifier |
| Settings | IconGear |
| Sheet | IconSquareGrid |
| Shield | IconLock |
| ShieldCheck | IconClipboardLock |
| ShieldHalf | IconLock |
| Shuffle | IconArrowsBoldOppositeDirection |
| Smartphone | IconPhone |
| Sparkles | IconSparkle |
| SquareArrowOutUpRight | IconOpenInBrowser |
| Sun | IconBrightnessIncrease |
| Ticket | IconCreditCards |
| Trash2 | IconDeleteX |
| TriangleAlert | IconTriangleWarning |
| UserCheck | IconClipboardCheck |
| UserCog | IconMonitorSetting |
| UserMinus | IconDeleteX |
| UserPlus | IconUser |
| UserRound | IconUser |
| UserX | IconBan |
| Users | IconUsers |
| X | IconTabClose |
| XCircle | IconBan |

## 검증

- 프로덕션 mock 빌드·TypeScript 통과. 프런트엔드 테스트 22개 통과, 2개 건너뜀.
- 추가 SVG 검증: 반복 렌더링 시 ID 중복 없음, 모든 gradient·filter·mask 참조 대상 존재, 접근성 이름·크기·상태색 유지.
- 메뉴 열기·닫기, mock 로그인·행사 이동, 운영진 로그인·로그아웃 확인. 모바일 행사와 데스크톱 운영진 화면에서 실제 SVG 렌더링 확인, 가로 넘침 없음.
- lint 오류 및 이번 작업에서 추가된 경고 없음. 기존 경고는 유지.
- 기존 안개 수정은 그대로 유지. 인증·라우터·API·백엔드·스마트 컨트랙트 변경 및 push·배포 없음.
