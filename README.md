# Tell the Vision

재학생 인증 NFT 입장권. GDGoC DevFest 스프린트 프로젝트.

## 구조

| 폴더 | 내용 | 담당 |
| --- | --- | --- |
| `functions/` | Cloud Functions (백엔드), 시드 스크립트(`seed.ts`) | 백엔드 |
| `apps/web/` | 웹앱 (프론트) | 프론트 |
| `contracts/` | 스마트 컨트랙트. 초기화는 블록체인 담당이 한다 | 블록체인 |
| `docs/` | API 명세, 기술 설계 | 전원 |

프론트는 `functions/src/api.ts`에서 함수 요청·응답 타입을 가져다 쓴다.

## 백엔드 실행

```bash
npm --prefix functions install
npm --prefix functions run build
npm --prefix functions test
```

에뮬레이터 통합 테스트는 JDK 21 이상이 필요하다. 기본 Java가 21 미만이면 `JAVA_HOME`을 21 이상으로 지정해서 실행한다.

```bash
npm --prefix functions run test:int
```

## 환경 변수

`apps/web/.env.example`을 `apps/web/.env.local`로 복사해 값을 채운다. `.env.local`은 커밋하지 않는다.

## 배포

배포 전 팀 확인이 필요하다.

```bash
firebase deploy --only firestore:rules,functions
```
