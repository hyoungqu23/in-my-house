# In My House

QR 하나로 같은 공간의 3–6명이 참여하는 웹 보드게임입니다. 첫 게임 **불 꺼진 집**은 각 휴대폰의 비밀 패와 TV 또는 휴대폰의 공개 보드를 분리한 블러핑 게임입니다.

## 바로 실행하기

Node.js 24 LTS가 필요합니다.

```bash
nvm use
pnpm install
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열고 **불을 끄고 시작하기**를 누릅니다. 기본값은 설정이 필요 없는 메모리 저장소입니다. 개발 서버를 다시 시작하면 방이 사라집니다.

같은 컴퓨터에서 여러 명을 시험할 때는 일반 창과 시크릿 창을 섞거나 서로 다른 브라우저 프로필을 사용해야 각기 다른 기기로 인식됩니다.

## Supabase 모드

1. Supabase 프로젝트에서 Anonymous Sign-Ins를 활성화합니다.
2. `supabase/migrations/202607220001_dark_house.sql`을 적용합니다.
3. `.env.example`을 `.env.local`로 복사하고 값을 입력합니다.
4. `GAME_STORE=supabase`로 변경한 뒤 개발 서버를 다시 시작합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GAME_STORE=supabase
CRON_SECRET=...
```

서비스 역할 키는 서버 전용이며 `NEXT_PUBLIC_` 접두사를 붙이면 안 됩니다. Supabase 모드는 저장 revision 비교·교환으로 참가 및 행동 충돌을 막고, 비밀이 없는 `room_events`만 인증된 방 구성원에게 Realtime으로 공개합니다.

## 주요 화면

- `/` — 게임 카탈로그와 방 생성
- `/room/:code/join#token` — 닉네임 설정 및 참가; fragment는 즉시 주소에서 제거
- `/room/:code` — 개인/공개 화면 전환, 게임 행동, 호스트 로비
- `/room/:code/display#token` — TV용 공개 보드

## 구조

- `src/app/` — 페이지와 얇은 HTTP Route Handler
- `src/modules/dark-house/domain/` — 순수 게임 상태·행동·전이
- `src/modules/dark-house/projection/` — 공개/플레이어별 allowlist 투영
- `src/modules/dark-house/ui/` — 게임 규칙에 종속된 공개 보드와 개인 조작 화면
- `src/modules/room/` — 방 계약, 입장, idempotency, version, heartbeat, 토큰 회전
- `src/modules/room/repository/` — 저장소 인터페이스와 메모리/Supabase 어댑터
- `src/modules/auth/` — 브라우저 익명 인증과 서버 사용자 확인
- `src/shared/` — 여러 모듈에서 사용하는 오류, HTTP, UI
- `supabase/migrations/` — RLS, CAS RPC, secret-free 이벤트, 만료 정리

전체 비밀 상태는 서버에만 존재합니다. 공개 화면에는 공개된 토큰 종류만, 개인 화면에는 해당 플레이어의 손과 스택만 반환합니다. 도전 단계에서는 모든 플레이어의 `self` 투영을 제거합니다.

## 검증

```bash
pnpm check
pnpm build
pnpm test:e2e
```

`pnpm check`는 ESLint, Next route type 생성, TypeScript, Vitest를 실행합니다. E2E 최초 실행 전 Playwright Chromium 설치가 필요할 수 있습니다.
