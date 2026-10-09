# In My House

QR 하나로 같은 공간의 2–6명이 참여하는 웹 보드게임입니다. **불 꺼진 집**, **수상한 초대장**, **새벽의 배전반**은 3–6명, **한밤의 발자국**은 2명, **이어지는 숲길**은 4–6명이 각 휴대폰의 개인 화면과 TV 또는 휴대폰의 공개 보드로 즐길 수 있습니다.

## 바로 실행하기

Node.js 24 LTS가 필요합니다.

```bash
nvm use
pnpm install
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열고 원하는 게임의 시작 버튼을 누릅니다. 기본값은 설정이 필요 없는 메모리 저장소입니다. 개발 서버를 다시 시작하면 방이 사라집니다.

같은 컴퓨터에서 여러 명을 시험할 때는 일반 창과 시크릿 창을 섞거나 서로 다른 브라우저 프로필을 사용해야 각기 다른 기기로 인식됩니다.

같은 Wi-Fi의 휴대폰으로 시험할 때는 호스트도 컴퓨터의 LAN 주소(예: `http://192.168.0.10:3000`)로 접속해 방을 만들어야 초대 링크에 그 주소가 들어갑니다. HTTP에서는 UUID 생성 대체 경로를 사용하고, 자동 복사가 불가능하면 초대 링크를 직접 선택해 복사할 수 있습니다.

이어지는 숲길은 다섯 계절의 지형 드래프트, 동물 서식지 완성, 이웃 방문, 최종 점수와 재경기까지 플레이할 수 있습니다. 새 경기는 `balanced-2` 플레이테스트 규칙을 사용하고, 기존 경기는 시작할 때 저장된 규칙을 유지합니다. 보상·방문 규칙의 검증 상태는 [밸런스 실험 문서](docs/plans/connected-forest-balance.md)에 기록합니다. 연결이 끊기면 선택과 남은 시간을 보관하고, 3분 후에는 승자 없이 마칠 수 있습니다. 구현·검증 기록은 [디지털 게임 문서](docs/plans/connected-forest-game.md)를 참고하세요.

## Supabase 모드

1. Supabase 프로젝트에서 Anonymous Sign-Ins를 활성화합니다.
2. `supabase/migrations/`의 migration을 파일명 순서대로 모두 적용합니다.
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

메모리 모드도 revision 비교·교환으로 동시 요청을 처리합니다. 실패한 요청의 상태가 저장된 방에 섞이지 않도록 읽기·저장 경계에서 깊은 복사를 사용합니다.

## 주요 화면

- `/` — 게임 카탈로그와 방 생성
- `/room/:code/join#token` — 닉네임 설정 및 참가; fragment는 즉시 주소에서 제거
- `/room/:code` — 개인/공개 화면 전환, 게임 행동, 호스트 로비
- `/room/:code/display#token` — TV용 공개 보드

## 구조

- `src/app/` — 페이지와 얇은 HTTP Route Handler
- `src/modules/game-catalog/` — 게임 식별자, 공개 상태, 지원 인원 등 방 생성에 필요한 카탈로그
- `src/modules/game-runtime/` — 방이 게임별 생성·전이·투영을 호출하는 판별 유니온 seam
- `src/modules/dark-house/domain/` — 순수 게임 상태·행동·전이
- `src/modules/dark-house/projection/` — 공개/플레이어별 allowlist 투영
- `src/modules/dark-house/ui/` — 게임 규칙에 종속된 공개 보드와 개인 조작 화면
- `src/modules/suspicious-invite/` — 수상한 초대장의 상태 머신, 단어 덱, 투영, 공개/개인 화면
- `src/modules/connected-forest/` — 4–6인 숲길 드래프트, 비밀 손 투영, SVG 숲·동물과 전체 경기 UI
- `src/modules/room/` — 방 계약, 입장, idempotency, version, heartbeat, 토큰 회전
- `src/modules/room/repository/` — 저장소 인터페이스와 메모리/Supabase 어댑터
- `src/modules/auth/` — 브라우저 익명 인증과 서버 사용자 확인
- `src/shared/` — 여러 모듈에서 사용하는 오류, HTTP, UI
- `supabase/migrations/` — RLS, CAS RPC, secret-free 이벤트, 만료 정리

각 방은 생성 시 선택한 `gameId`와 해당 게임의 판별된 서버 상태를 저장합니다. 방 모듈은 게임 내부의 비밀 구조를 알지 않고 game runtime 인터페이스를 통해 생성·전이·투영합니다.

전체 비밀 상태는 서버에만 존재합니다. 공개 화면에는 공개된 토큰 종류만, 개인 화면에는 해당 플레이어의 손과 스택만 반환합니다. 도전 단계에서는 모든 플레이어의 `self` 투영을 제거합니다.

## 검증

```bash
pnpm check
pnpm build
pnpm test:e2e
```

`pnpm check`는 ESLint, Next route type 생성, TypeScript, Vitest를 실행합니다. E2E 최초 실행 전 Playwright Chromium 설치가 필요할 수 있습니다.

production 빌드로 E2E를 실행하려면:

```bash
pnpm build
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 PLAYWRIGHT_SERVER_COMMAND="pnpm start --hostname 127.0.0.1 --port 3101" pnpm test:e2e
```
