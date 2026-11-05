# DESIGN.md — Campass 디자인 가이드

> 흰 배경 위에 파스텔 그라데이션이 은은하게 번지는, 깔끔하고 가벼운 UI.
> 학생·검표 화면은 **폰 기준(375~430px)** 으로 만들고, 관리자 화면은 **노트북에서도 넓게** 보이도록 반응형으로 만든다. (4.1장)

---

## 1. 무드 & 원칙

- **화이트 + 공기감**: 배경은 순백. 요소 사이 여백을 넉넉하게 둔다.
- **포인트는 그라데이션 하나**: 화면마다 시선을 끄는 요소(입장권 카드, 스캔 프레임, 메인 버튼) 하나에만 파스텔 그라데이션을 쓴다. 나머지는 흰색·연회색.
- **부드러운 곡선**: 모서리는 크게 둥글게. 각진 요소는 쓰지 않는다.
- **얇고 조용한 텍스트**: 진한 검정 대신 짙은 회색. 굵기는 Regular / Medium / SemiBold만 쓴다.
- **그림자는 거의 없게**: 경계는 연한 테두리나 아주 옅은 그림자로만 구분한다.

### 하지 말 것
- 진한 원색, 네온, 다크 모드 배경
- 진한 그림자, 두꺼운 테두리
- 이모지 아이콘 (라인 아이콘만 사용)
- 한 화면에 그라데이션 요소 2개 이상
- 버튼 여러 개를 같은 강조도로 나란히 배치 (주 버튼은 화면당 1개)

---

## 2. 컬러 토큰

### 기본
| 토큰 | 값 | 용도 |
|---|---|---|
| `bg` | `#FFFFFF` | 화면 배경 |
| `surface` | `#F6F7F9` | 칩, 입력창, 보조 버튼, 아이콘 버튼 배경 |
| `surface-2` | `#EFF1F4` | 눌림 상태, 구분 영역 |
| `border` | `#ECEEF2` | 카드 테두리, 구분선 |
| `text-primary` | `#1F2328` | 제목, 본문 |
| `text-secondary` | `#6B7280` | 설명, 라벨 |
| `text-muted` | `#A3A9B4` | 플레이스홀더, 상단 헤더 제목, 시간 표시 |

### 파스텔 (그라데이션 재료)
| 토큰 | 값 |
|---|---|
| `sky` | `#CFE4FF` |
| `lavender` | `#DCD7FF` |
| `pink` | `#FAD3E4` |
| `peach` | `#FFE2C9` |
| `mint` | `#D3F1E2` |

### 상태
| 토큰 | 값 | 용도 |
|---|---|---|
| `success` | `#22A06B` | 입장 성공, 체크 아이콘 |
| `success-bg` | `#E8F7EF` | 성공 배경 |
| `danger` | `#E5484D` | 거부, 에러 |
| `danger-bg` | `#FDECEC` | 거부 배경 |
| `warning` | `#E59A1A` | 만료 임박, 주의 |
| `warning-bg` | `#FFF5E5` | 주의 배경 |
| `link` | `#3B82F6` | 약관 등 텍스트 링크 |

### 그라데이션 프리셋
```css
/* 입장권 카드 / 메인 비주얼: 하늘 → 라벤더 → 핑크 */
--grad-ticket: linear-gradient(160deg, #CFE4FF 0%, #DCD7FF 45%, #FAD3E4 100%);

/* 성공(입장 완료): 민트 → 하늘 */
--grad-success: linear-gradient(160deg, #D3F1E2 0%, #CFE4FF 100%);

/* 주의/만료: 피치 → 핑크 */
--grad-warm: linear-gradient(160deg, #FFE2C9 0%, #FAD3E4 100%);

/* 주 버튼: 라벤더 → 핑크 (아주 연하게) */
--grad-button: linear-gradient(90deg, #E6E1FF 0%, #FBDCEA 100%);

/* 몽환적 원형 블롭 (로그인 등 비주얼) */
--grad-orb: radial-gradient(circle at 35% 35%, #FFE2C9 0%, #FAD3E4 30%, #DCD7FF 60%, #CFE4FF 100%);
```
- 블롭/카드에는 `filter: blur()` 대신 **겹친 radial-gradient**로 번짐을 표현한다. 필요하면 `opacity: 0.9`.
- 그라데이션 위 텍스트는 `text-primary` 또는 흰색(`#FFFFFF`, 그림자 없이).

### 2.1 학교·행사 테마
Campass는 학교(학생회)에 파는 서비스라 학교 상징색과 행사 디자인에 맞춰 포인트 색을 바꾼다. 위의 값은 **기본 테마**다.

- **바뀌는 것**: 파스텔 4색(`sky` `lavender` `pink` `peach`)과 `--grad-ticket`, `--grad-button`, `--grad-orb`
- **고정**: 기본색(흰색·회색·글자색), 상태색(`success` `danger` `warning`), `--grad-success`, `--grad-warm`. 성공·거부의 의미가 학교마다 달라지면 안 되기 때문
- **우선순위**: 행사 디자인 색 > 학교 상징색 > 기본 테마
- **로그인 화면은 항상 기본 테마(보라)**: 로그인 전에는 어느 학교인지 모르므로 Campass 자체 색을 쓴다. 로그인한 뒤부터 학교·행사 테마를 적용하고, 로그아웃하면 다시 기본 테마로 돌아온다
- **만드는 법** (`src/app/theme.ts`의 `buildTheme`)
  - 시드 색이 진한 원색이어도 화면에는 그대로 쓰지 않는다. 색상(hue)만 가져오고 채도 35~75%, 명도 88%(버튼 93%)의 파스텔로 바꾼다
  - 시드 1개(학교 상징색): 색상환에서 양옆 ±28°를 더해 3색 그라데이션
  - 시드 3개(행사 디자인): 포스터에서 뽑은 3색을 각각 파스텔로
- **행사 디자인 색 뽑기**: 관리자가 포스터 이미지를 올리면 브라우저에서 대표색 3개(서로 30° 이상 떨어진 색상)를 뽑는다. 흰색·검정·회색 픽셀은 버린다. 뽑은 색은 관리자가 직접 고칠 수 있다. 이미지는 저장하지 않는다
- 테마 색은 CSS 변수(`:root`의 `--c-p1~4`, `--grad-*`)로 바뀌므로 컴포넌트에서 hex 값을 직접 쓰지 않는다

---

## 3. 타이포그래피

- 폰트: **Pretendard** (CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css`)
- 기본 letter-spacing: `-0.01em`

| 스타일 | 크기 / 줄간격 | 굵기 | 용도 |
|---|---|---|---|
| `display` | 28 / 36 | SemiBold 600 | 화면 대표 문구 ("입장 완료") |
| `title` | 22 / 30 | SemiBold 600 | 화면 제목 |
| `heading` | 17 / 24 | Medium 500 | 카드 제목, 섹션 제목 |
| `body` | 15 / 22 | Regular 400 | 본문 |
| `label` | 13 / 18 | Medium 500 | 칩, 버튼 보조, 라벨 |
| `caption` | 12 / 16 | Regular 400 | 안내문, 시간, 약관 |
| `number` | 44 / 48 (`lg` 이상 64 / 72) | SemiBold 600, tabular-nums | 관리자 입장 인원 큰 숫자 |

- 상단 헤더의 화면 제목은 **가운데 정렬, `text-muted`, heading 크기**로 은은하게.

---

## 4. 간격 · 모서리 · 그림자

- 간격 단위: **4px 배수** (4, 8, 12, 16, 20, 24, 32, 40)
- 화면 좌우 패딩: `20px`
- 섹션 사이: `24~32px`

| 토큰 | 값 | 용도 |
|---|---|---|
| `radius-xl` | `28px` | 입장권 카드, 스캔 프레임, 바텀시트 상단 |
| `radius-lg` | `20px` | 일반 카드 |
| `radius-md` | `14px` | 입력창, 리스트 아이템 |
| `radius-full` | `9999px` | 버튼, 칩, 아이콘 버튼, 아바타 |

| 토큰 | 값 |
|---|---|
| `shadow-soft` | `0 8px 24px rgba(31, 35, 40, 0.06)` |
| `shadow-float` | `0 12px 32px rgba(120, 110, 200, 0.12)` (그라데이션 카드 전용) |

### 4.1 레이아웃 · 반응형

폰 프레임(가운데 고정 폭 상자)으로 모든 화면을 가두지 않는다. 화면 묶음마다 기준이 다르다.

| 묶음 | 폰 (< 768px) | 태블릿·노트북 (≥ 768px) |
|---|---|---|
| 학생 (`/`, `/event`, `/ticket`, `/ticket/transfer`) | 전체 폭, 좌우 20px | 내용 영역 최대 480px, 가운데 정렬. 배경은 그대로 흰색 |
| 검표 (`/staff/scan`) | 전체 폭, 좌우 20px | 내용 영역 최대 480px, 가운데 정렬 |
| 관리자 (`/admin`) | 한 열로 쌓기, 좌우 20px | 최대 1200px, 좌우 32px, 그리드 (아래) |

- 브레이크포인트는 Tailwind 기본값(`md` 768px, `lg` 1024px)을 쓴다.
- 하단 고정 버튼은 폰에서만 고정한다. `md` 이상에서는 내용 바로 아래에 두고 너비는 내용 영역에 맞춘다.
- 결과 시트(`ResultSheet`)는 `md` 이상에서도 내용 영역(480px) 폭으로 아래에서 올라온다.

#### 관리자 화면 틀 (`AdminLayout`)
- 상단 바(모든 메뉴 공통): 좌 "학교명 · Campass 관리자" + 행사명 / 우 "검표 화면"(secondary sm) + 로그아웃
- 메뉴 9개를 3묶음으로: 운영(실시간 현황, 입장 기록, 발급 현황, 양도 기록) / 사람(재학생 승인, 기기 초기화, 스태프 관리, 명단 연동) / 설정(행사 설정)
- `lg` 이상: 왼쪽 세로 메뉴 208px(묶음 제목 `caption` `text-muted`), 오른쪽 본문. 폰·태블릿: 상단 바 아래 가로 스크롤 메뉴
- 메뉴 항목: 높이 40px, `radius-full`, 아이콘 18px + `label`. 선택됨: `lavender` 배경. 처리할 일이 있으면 오른쪽에 숫자 배지(`danger` 배경, 흰 글자)
- 각 메뉴 화면 맨 위: `PageTitle` (`title` 제목 + `body` `text-secondary` 설명 + 우측 동작 버튼)

#### 관리자 실시간 현황 그리드
- `lg` 이상: 12열, 간격 24px
  - 제목 줄 우측: 실시간 표시(초록 점 + "실시간") + 마지막 갱신 시각
  - 1행: 인원 카드 8열 + 작은 카드 2개를 세로로 4열 (거부된 시도 / 마지막 입장 시각)
  - 2행: 최근 기록 12열 (표 형태: 사진, 이름, 학번, 결과 배지, 시각)
- `md`~`lg`: 인원 카드 전체 폭 → 작은 카드 2개 나란히 → 최근 기록
- 폰: 모두 한 열
- 관리자 화면은 노트북을 띄워 두고 보는 화면이라 큰 숫자(`number`)는 `lg` 이상에서 64/72로 키운다.

---

## 5. 컴포넌트

### 상단 헤더 (`AppHeader`)
- 높이 56px. 좌: 뒤로가기 아이콘 버튼 / 중앙: 화면 제목(`text-muted`) / 우: 메뉴 아이콘 버튼
- 아이콘 버튼: 40×40, `surface` 배경, `radius-full`, 아이콘 20px `text-secondary`

### 버튼 (`Button`)
- 높이 52px, `radius-full`, 텍스트 `label`~`body` Medium, 색 `text-primary`
- **primary**: 배경 `--grad-button`, 테두리 없음
- **secondary**: 배경 `surface`
- **ghost**: 배경 없음, 텍스트 `text-secondary`
- **disabled**: 배경 `surface`, 텍스트 `text-muted`
- 눌림: `scale(0.98)` + 밝기 살짝 낮춤
- 화면 하단 고정 버튼은 좌우 20px, 하단 safe-area + 16px

### 칩 (`Chip`)
- 높이 32px, 좌우 패딩 12px, `surface` 배경, `label`, `text-secondary`
- 선택됨: `text-primary` + 배경 `lavender`

### 상태 배지 (`StatusBadge`)
- 높이 28px, `radius-full`, 아이콘 14px + `label`
- 발급됨: `surface` / `text-secondary`
- 사용 가능: `success-bg` / `success`
- 사용됨: `surface-2` / `text-muted`
- 만료 임박: `warning-bg` / `warning`

### 카드 (`Card`)
- 흰 배경, `border` 1px, `radius-lg`, 패딩 20px, 그림자 없음 (또는 `shadow-soft`)

### 입장권 카드 (`TicketCard`) ★ 핵심 비주얼
- 너비 100%, 비율 약 3:4, `radius-xl`, 배경 `--grad-ticket`, `shadow-float`
- 구성(위→아래):
  1. 행사명(heading) + `StatusBadge`
  2. QR: 흰 라운드 박스(radius 20px, 패딩 16px) 안에 QR. QR 색 `#1F2328`
  3. QR 아래 **카운트다운 바**: 30초 진행 바(높이 4px, 흰색 50% 트랙 + 흰색 진행)와 "12초 후 새로고침" caption
  4. 하단 흰 반투명 패널(`rgba(255,255,255,0.7)`, radius 20px): 원형 사진 56px + 이름(heading) + 학번(caption) + `NFT #0012`(caption, `text-secondary`)

### 스캔 프레임 (`ScanFrame`)
- 카메라 영역: `radius-xl`, 비율 1:1 또는 3:4
- 카메라 준비 전 배경: `--grad-ticket` (또는 `--grad-success`)
- 네 모서리에 **흰색 꺾쇠(ㄱ자 브래킷)**: 길이 28px, 두께 3px, 둥근 끝
- 상단 안내: 체크 아이콘(`success`) + "QR을 프레임 안에 맞춰주세요" (`body`)
- 아래 안내 리스트: 라인 아이콘 + `caption` `text-secondary` 3줄

### 결과 시트 (`ResultSheet`) — 검표 결과
- 화면 하단에서 올라오는 바텀시트, 상단 `radius-xl`, 흰 배경
- 성공: 상단에 `--grad-success` 원형 블롭(96px) 안에 체크 아이콘 → `display` "입장 완료" → 큰 사진(120px 원형) + 이름 + 학번 → 안내 "사진과 얼굴을 확인해 주세요"
- 거부: `--grad-warm` 블롭 + X 아이콘(`danger`) → `display` "입장 불가" → 사유(`body`): 만료된 QR / 이미 사용된 입장권 / 확인할 수 없는 QR / 사진과 얼굴이 다름
- **2단계 검표**(기본): QR이 유효하면 먼저 "본인 확인" 단계 → `success-bg` 배지 "유효한 입장권" → `display` "사진과 얼굴이 같나요?" → 사진 160px + 이름·학번 → primary "같아요, 입장 처리" + secondary "달라요, 입장 거부". 누른 뒤 위의 성공/거부 화면으로 바뀐다
- 하단 primary 버튼 "다음 스캔"

### 입력창 (`TextField`)
- 높이 52px, `surface` 배경, 테두리 없음, `radius-md`, 패딩 16px
- 포커스: 배경 흰색 + 테두리 1.5px `lavender`
- 에러: 테두리 `danger` + 아래 `caption` 에러 문구(`danger`)

### 블롭 (`Orb`)
- 원형, `--grad-orb`, 크기 160~200px. 로그인·완료 화면의 주 비주얼
- 선택: 6s 주기로 아주 느리게 `scale(1 ↔ 1.03)` (prefers-reduced-motion이면 정지)

### 리스트 아이템 (`ListItem`)
- 높이 64px, 좌 아바타 40px, 가운데 제목/부제, 우 시간(caption muted) 또는 배지
- 아이템 사이 구분선 `border`

### 통계 카드 (`StatCard`) — 관리자
- `Card` 스타일, 위: 아이콘 20px + `label` `text-secondary` / 아래: 값 `title` (tabular-nums)
- 예: 거부된 시도(`XCircle`) "7건", 마지막 입장(`Clock`) "21:04"

### 인원 카드 (`CapacityCard`) — 관리자 그라데이션 포인트
- `radius-xl`, 배경 `--grad-ticket`를 흰색 위에 `opacity 0.5`로 연하게, 패딩 24px(`lg` 32px)
- 큰 숫자 "312" + `heading` " / 500명" → 진행 바(높이 8px, 흰색 60% 트랙 + `text-primary` 진행) → 퍼센트 `label`

### 행사 테마 편집 (`ThemeEditor`) — 관리자
- 관리자 "행사 설정" 맨 아래 흰 카드. 좌: 설정 / 우: 미리보기 (`lg` 7:5, 폰은 위아래)
- 상단 세그먼트(`surface` 트랙 + 선택된 쪽 흰색): "학교 상징색" / "행사 디자인"
- 학교 상징색: 원형 색 견본 40px + 학교명 + hex
- 행사 디자인: "포스터 이미지 올리기"(secondary sm) + 샘플 포스터 썸네일 + 뽑은 색 3개(누르면 색 선택기)
- 미리보기: 작은 입장권 카드·블롭·주 버튼. 미리보기 영역에만 변수를 걸어 전체 화면은 그대로 둔다
- 하단 우측 primary sm "테마 적용" (바뀐 것이 없으면 비활성)

### 관리자 목록 (`ResponsiveTable`, `FilterChips`, `SearchField`)
- 목록 화면 순서: 위 `FilterChips`(칩 + 개수, 선택됨 `lavender`) · 오른쪽 `SearchField`(높이 40px, `surface`, `radius-full`) → 아래 목록
- `md` 이상은 흰 카드 안의 표(행 높이 56px), 폰은 `ListItem` 목록. 비어 있으면 카드 안에 안내 문구
- 학번은 목록에서 마스킹(`2023**34`). 재학생 승인처럼 대조가 필요한 화면만 전체 표시

### 배지 (`Badge`)
- `StatusBadge`와 같은 모양. 정해진 상태가 없는 곳(양도 결과, 역할 등)에 tone으로 쓴다: success / danger / warning / neutral / muted

### 토글 (`Toggle`)
- 행 전체가 눌림 영역. 좌: 제목(`body`) + 설명(`caption`), 우: 48×28 스위치(켜짐 `text-primary` 배경, 꺼짐 `surface-2`)

### 다음 단계 안내 (`NextStepNote`)
- `surface` 배경, `radius-md`, Info 아이콘 + `caption`. 실제 연동 전인 기능(블록체인, 기기 서명, 시트 연동, 사진 저장)에 붙여 발표에서 "다음 단계"로 설명한다

### 사진 고르기 (`ImagePicker`) — 온보딩
- 본인 사진: 160px 원형, 학생증: 16:10 카드. 비어 있으면 점선 테두리 + 카메라 아이콘 + 안내. 고르면 미리보기 + 우하단 바꾸기 아이콘

### 진행 단계 (온보딩)
- 상단 4칸 진행 바(높이 4px, 지난 단계 `text-primary`, 남은 단계 `surface-2`) + 단계 이름 `caption`

### 타임라인 (발급·양도 기록)
- 좌: 40px 원형 아이콘(발급 `lavender`, 양도 받음 `sky`, 양도 보냄 `warning-bg`, 입장 `success-bg`) + 세로 연결선 `border`
- 우: 제목(`body`) + 시각(`caption` muted) / 설명(`caption`) / 기록 해시(`caption` muted, 고정폭, `0x12ab…9f3c`)

### 최근 기록 표 (`EntryLogTable`) — 관리자
- `md` 이상: 흰 `Card` 안의 표. 헤더 행 `label` `text-muted`, 행 높이 56px, 행 사이 구분선 `border`
- 열: 사진(32px 원형) · 이름 · 학번(뒤 3자리만, 예: `20***123`) · 결과 배지 · 시각
- 결과 배지: 입장(`success-bg`/`success`), 만료(`warning-bg`/`warning`), 중복(`danger-bg`/`danger`), 확인 불가(`surface-2`/`text-muted`)
- 폰: 표 대신 `ListItem` 목록
- 새 기록은 맨 위에 붙고 배경이 `lavender` 20%에서 투명으로 1s 동안 사라진다

---

## 6. 아이콘

- **lucide-react** 라인 아이콘, stroke 1.75, 크기 20px(기본) / 16px(칩·배지)
- 자주 쓰는 것: `ChevronLeft`, `Menu`, `X`, `CheckCircle2`, `XCircle`, `ScanLine`, `QrCode`, `Ticket`, `Users`, `ArrowLeftRight`, `ShieldCheck`, `Clock`, `RefreshCw`, `Sun`(밝기 안내)

---

## 7. 모션

- 기본 전환: `200ms ease-out`
- 바텀시트: 아래에서 위로 `260ms cubic-bezier(0.2, 0.8, 0.2, 1)`
- QR 교체 시: 이전 QR `opacity 1→0` → 새 QR `0→1` (150ms씩)
- 관리자 숫자 증가: 숫자가 바뀔 때 살짝 위로 올라오며 페이드
- `prefers-reduced-motion: reduce`이면 모든 애니메이션 제거

---

## 8. 화면별 적용 요약

### 학생 (폰)
| 화면 | 경로 | 그라데이션 포인트 | 주 버튼 |
|---|---|---|---|
| 로그인 | `/` | `Orb` (가운데 큰 블롭) | "학교 계정으로 시작하기" |
| 첫 로그인 (4단계) | `/onboarding` | 없음 | "다음" / "승인 요청 보내기" |
| 승인 대기 | `/onboarding/pending` | `Orb` | 없음 (secondary "승인됐는지 확인하기") |
| 기기 확인 | `/device` | `Orb` (`warm`) | "폰을 바꿨어요, 초기화 요청하기" |
| 축제 상세 · 발급 | `/event` | 상단 행사 비주얼 카드 | "입장권 받기" |
| 내 입장권 | `/ticket` | `TicketCard` | 없음 (secondary "양도하기") |
| 발급·양도 기록 | `/ticket/history` | 상단 NFT 요약 카드 | 없음 |
| 양도 요청 | `/ticket/transfer` | 없음 (흰 화면 + 입력창) | "양도 요청 보내기" |
| 양도 받기 | `/transfers/:id` | 상단 입장권 카드 | "입장권 받기" (ghost "거절하기") |
| 내 정보 | `/me` | 없음 | 없음 (secondary "로그아웃") |

### 검표 스태프 (폰)
| 화면 | 경로 | 그라데이션 포인트 | 주 버튼 |
|---|---|---|---|
| 검표 | `/staff/scan` | `ScanFrame` | 결과 시트의 "같아요, 입장 처리" / "다음 스캔" |
| 내 검표 기록 | `/staff/history` | 없음 | 없음 |

### 학생회 관리자 (노트북 + 폰)
| 화면 | 경로 | 그라데이션 포인트 | 주 버튼 |
|---|---|---|---|
| 실시간 현황 | `/admin` | `CapacityCard` | 없음 |
| 입장 기록 / 발급 현황 / 양도 기록 | `/admin/entries` `/tickets` `/transfers` | 없음 | 없음 (secondary "CSV 내보내기") |
| 재학생 승인 | `/admin/approvals` | 없음 | "승인" (sm) |
| 기기 초기화 / 스태프 관리 / 명단 연동 | `/admin/devices` `/staff` `/roster` | 없음 | 명단 연동만 "불러오기" (sm) |
| 행사 설정 | `/admin/settings` | 테마 미리보기만 | "테마 적용" (sm) |

### 공통
| 화면 | 경로 | 기기 기준 | 그라데이션 포인트 | 주 버튼 |
|---|---|---|---|---|
| 서비스 소개 | `/about` | 노트북 + 폰 (본문 최대 768px) | 상단 `Orb` | "데모 시작하기" |
| 이용약관 · 개인정보 처리방침 | `/terms` `/privacy` | 폰 | 없음 | 없음 |

---

## 9. Tailwind 설정 예시

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surface: { DEFAULT: '#F6F7F9', 2: '#EFF1F4' },
        line: '#ECEEF2',
        ink: { DEFAULT: '#1F2328', 2: '#6B7280', 3: '#A3A9B4' },
        sky: '#CFE4FF',
        lavender: '#DCD7FF',
        pink: '#FAD3E4',
        peach: '#FFE2C9',
        mint: '#D3F1E2',
        success: { DEFAULT: '#22A06B', bg: '#E8F7EF' },
        danger: { DEFAULT: '#E5484D', bg: '#FDECEC' },
        warning: { DEFAULT: '#E59A1A', bg: '#FFF5E5' },
      },
      fontFamily: { sans: ['Pretendard', 'system-ui', 'sans-serif'] },
      maxWidth: { app: '480px', admin: '1200px' },
      borderRadius: { md: '14px', lg: '20px', xl: '28px' },
      boxShadow: {
        soft: '0 8px 24px rgba(31,35,40,0.06)',
        float: '0 12px 32px rgba(120,110,200,0.12)',
      },
      backgroundImage: {
        'grad-ticket': 'linear-gradient(160deg,#CFE4FF 0%,#DCD7FF 45%,#FAD3E4 100%)',
        'grad-success': 'linear-gradient(160deg,#D3F1E2 0%,#CFE4FF 100%)',
        'grad-warm': 'linear-gradient(160deg,#FFE2C9 0%,#FAD3E4 100%)',
        'grad-button': 'linear-gradient(90deg,#E6E1FF 0%,#FBDCEA 100%)',
        'grad-orb': 'radial-gradient(circle at 35% 35%,#FFE2C9 0%,#FAD3E4 30%,#DCD7FF 60%,#CFE4FF 100%)',
      },
    },
  },
};
```
