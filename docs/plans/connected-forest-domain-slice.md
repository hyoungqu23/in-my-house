# 이어지는 숲길 · Gate 2 도메인 구현 계획

Status: IMPLEMENTED — BALANCE GATE PENDING  
Reviewed: 2026-09-05 — 구현 리뷰 5개 이슈 수정  
Source: [`connected-forest.md`](./connected-forest.md)

## 목표와 범위

4–6인 게임 전체를 UI 없이 실행할 수 있는 순수 TypeScript 도메인 슬라이스를 만든다. Gate 1 사람 플레이 데이터가 아직 없으므로 보상은 `prototype-1` 잠정값으로 유지하고, 카탈로그·룸·projection에는 연결하지 않는다.

기존 `docs/plans/assets/connected-forest-sim.py`와 사용자의 미커밋 수정은 보존한다. Python은 이관 근거와 golden corpus 생성에만 사용하고 Gate 2 이후의 기준 시뮬레이터는 TypeScript다.

## 구현 구조

`src/modules/connected-forest/domain/`에 다음 경계를 둔다.

- `types.ts`: `ConnectedForestState`, `ConnectedForestAction`, `ConnectedForestSetup`, `ConnectedForestRulesVersion`, `Forest*` 콘텐츠·상태 타입, 게임 전용 오류 코드 union.
- `content.ts`: 19칸 보드, 지형 90장, 동물 48장, `CONNECTED_FOREST_RULES_BY_VERSION`, `createMatchSetup({ seats, randomIndex, rulesVersion })`.
- `rules.ts`: 육각 인접·회전, habitat 매칭, 피규어 점유 selector, 방문 합법성, 점수, 상태 불변식. 범용 게임 유틸은 만들지 않는다.
- `reducer.ts`: `createInitialState`, `transition`, `advanceTimedState`, `legalActions`. setup에 확정된 덱만 사용하고 난수를 호출하지 않는다.
- `simulator.ts`: 실제 `content.ts`와 `rules.ts`를 import해 발신자 모델, 선택 정책, 계측, 보상 sweep을 실행한다.

피규어는 `players[].figures` 판별 유니온 한 곳에만 저장한다. 보드 칸은 지형과 황금 도토리 정체성만 저장하며, 주민·방문객 목록과 점유 map은 selector로 계산한다.

```text
createMatchSetup(randomIndex, rulesVersion)
                 │
                 ▼
       확정된 덱 + 좌석 + 규칙 버전
                 │
                 ▼
         createInitialState
                 │
     ┌───────────┴───────────┐
     ▼                       ▼
 transition(action)   advanceTimedState(now)
     └───────────┬───────────┘
                 ▼
      rules.ts 불변식 검사
```

## 규칙과 오류 계약

- 상태는 `rulesVersion: "prototype-1"`을 저장한다. 알 수 없는 버전과 setup 좌석 불일치는 `INVALID_GAME_SETUP`이다.
- 잠정 보상은 STAY 수신 2하트/발신 1잎, WALK 수신 3잎/발신 1잎, 길 완성 양쪽 3잎, 상한 3이다. 테스트는 숫자를 복제하지 않고 규칙 객체를 참조한다.
- `ConnectedForestErrorCode`는 잘못된 phase·플레이어·카드·배치·교환·도토리·habitat·방문·일시정지·기권·콘텐츠 불변식 코드를 고정한다.
- 동시 pick 제출은 중첩 `welcome`까지 복사해 `phaseKey` 아래 저장하고 마지막 제출 또는 deadline에 좌석 오름차순으로 적용한다. 호출자의 입력 객체 변경은 잠긴 선택에 영향을 주지 않는다.
- 방문 응답은 수신자별 큐가 병렬로 흐르며, 같은 숲길을 두 큐가 갱신하면 모든 관련 `legalActions`를 즉시 다시 계산한다.
- 방문 큐 생성 직후 두 선택 모두 불가능한 방문은 즉시 배웅하며, 큐가 모두 비면 공개 단계로 넘어간다.
- 현재 입력이 필요한 좌석의 연결 해제만 전체 deadline을 정지한다. 이미 제출한 좌석, 방문할 주민이 없는 좌석, 응답 큐가 끝난 좌석은 현재 단계를 막지 않는다. phase가 바뀌면 대기 좌석을 다시 계산하며 재접속 시 동일 offset을 더한다. 3분 뒤 `CLAIM_FORFEIT`은 승자 없이 종료한다.

## 시뮬레이터 이관

- Python에 JSON golden 모드를 추가한다. 작은 고정 corpus마다 셔플된 지형·동물 덱, 정책 배정, 무작위 발신 선택 입력, 최종 점수와 선택 계측을 기록한다.
- TypeScript parity 테스트는 JSON 입력을 그대로 소비한다. Python `random.Random`의 MT19937을 다시 구현하거나 같은 seed만으로 일치를 주장하지 않는다.
- TypeScript 시뮬레이터는 `A최단`, `B무작위`, `C완성임박`과 `STAY`, `WALK`, `MIXED`를 교차하고 `freeRate`, `freeWalkRate`, 강제 선택, 배웅, 승률 격차, 완성 숲길, 숲길 점수 비중을 출력한다.
- 덱과 별도 난수 스트림으로 정책 좌석을 섞고, 세 판마다 정책 라벨을 순환한다. 각 판은 세 정책을 모두 포함하며 어떤 판수에서도 각 좌석의 정책별 배정 횟수 차이는 최대 1이다. Python에도 같은 실험 배정 원칙을 적용한다.
- 시뮬레이터의 승자는 reducer와 동일한 `scoreConnectedForest(state, rules)`로 정한다. 총점, 방문객 수, 주민 수가 모두 같을 때만 공동 승리다. 후보 보상 설정도 같은 함수에 전달한다. Python golden v2는 승자 좌석까지 저장한다.
- `pnpm check`에는 작은 smoke만 넣는다. 보상 변경 시 별도 `simulate:connected-forest` script로 조합당 1000판 이상의 full grid를 실행한다. Gate 1 전 탐색 결과는 일반 CI 통과 조건이나 확정 보상으로 취급하지 않는다.

## 테스트와 완료 조건

- `content.test.ts`: 카드·패턴·setup·인원·규칙 버전·주입 난수 재현성.
- `rules.test.ts`: 육각·회전·habitat·황금 도토리·단일 피규어 점유·방문·점수·동률.
- `reducer.test.ts`: 4·5·6인 전체 진행, 동시 제출, 모든 deadline, 빈 방문 계절, cross-queue 경합, pause/resume/forfeit.
- `simulator.test.ts`: Python golden parity, 발신자 3종과 자유·강제 계측 smoke.
- 200개 고정 seed의 합법 행동열을 실행하고 매 전이 뒤 카드 보존, 15개 배치와 4개 빈칸, `visitId` 유일성, 피규어 점유, 큐 진행, `leafHeartsFromPaths`, 점수 불변식을 검사한다.
- 자동 카드 선택의 지형 편향과 계절 251.8초/전체 1259초 deadline 예산을 측정한다.
- `vitest.config.ts`의 낡은 coverage include를 배포 도메인 `content.ts`, `rules.ts`, `reducer.ts`로 교체하고 lines/functions/branches/statements 100% threshold를 설정한다. `simulator.ts`는 golden·smoke 테스트로 검증하되 coverage 문턱에서는 제외한다. coverage 실행을 `pnpm check`에 연결한다.

## 제외 범위

- `GameId`, `StoredGame`, game runtime, room 계약과 저장소
- 공개·개인 projection과 비밀 누출 테스트
- 카탈로그 등록, 모바일·공용 UI, Playwright E2E
- 최종 보상 확정, 점토 미니어처, 음향과 애니메이션
- 수신자별 부분 일시정지

projection과 비밀 누출 테스트는 Gate 3의 출시 차단 조건이다. 해당 단계가 끝나기 전에는 `connected-forest`를 `playable`로 공개하지 않는다.

## 구현 결과

- `types.ts`, `content.ts`, `rules.ts`, `reducer.ts`, `simulator.ts`와 CLI wrapper를 추가했다.
- Python이 같은 주민을 계절마다 다시 방문시키던 `sent` 초기화 버그를 수정했다. 주민당 게임 전체 1회 방문 규칙으로 다시 계산했다.
- Python이 출력한 명시적 덱·배치·발신 입력 9개를 TypeScript가 점수, 선택 계측, 승자까지 정확히 재현한다.
- 4·5·6인 전체 진행과 200개 고정 seed 상태열을 포함해 저장소 테스트 87개 및 Python 회귀 테스트 2개가 통과한다.
- 배포 도메인 `content.ts`, `rules.ts`, `reducer.ts`는 statements/branches/functions/lines 모두 100% coverage다.
- lint, Next route type 생성, `tsc --noEmit`, Python compile, 시뮬레이터 package script가 통과했다.
- `pnpm check`는 코드 실행 전에 pnpm 11.9.0 레지스트리 서명 검증 실패로 실행되지 않았다. 동일 구성 명령을 로컬 바이너리로 각각 실행해 통과시켰다.
- 이전 200판 탐색의 최악 9.1%p 주장은 동률 집계 수정 전 결과이므로 폐기한다. 최신 재계산은 설계 문서의 `밸런스 검증 결과`를 따른다. Gate 1 관찰과 1000판 확정 전에는 `prototype-1`을 바꾸지 않는다.
