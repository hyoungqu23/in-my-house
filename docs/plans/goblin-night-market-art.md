# 도깨비 야시장 · 아기자기한 디자인 적용

> 2026-11-03: [소유자별 가게 외형](#소유자별-가게-외형--2026-11-03)을 추가했다. 최신 화면은 [주인별 보드](./assets/goblin-market-owned-shops-board.jpg)와 [390px 모바일](./assets/goblin-market-owned-shops-mobile.jpg)을 참고한다.

> 이후 [mvp-2 확장판](./goblin-night-market-mvp-v2.md)에 맞춰 28칸·12밤 표시를 적용했다. 최신 [확장 보드 캡처](./assets/goblin-market-expanded-board.jpg)와 [모바일 캡처](./assets/goblin-market-expanded-mobile.jpg)를 참고한다. 아래 20칸 캡처는 디자인 적용 당시 기록으로 보관한다.

작성: 2026-10-30 · 적용: 기존 mvp-1 규칙

## 방향

보름달 여관의 수채화와 이어지는 숲길의 작은 조각에서 재질감을 이어받았다. 따뜻한 크림색 종이, 세이지·살구·라벤더, 작은 노점과 둥근 요괴 상인으로 야시장을 표현한다. 야시장 그림 안에 달과 등불을 남기고, 조작 화면은 밝은 종이색으로 읽기 쉽게 만든다.

- 홈과 대기실: 등불 아래 네 상인이 모인 전용 수채화 키 비주얼.
- 20칸 보드: 업종별 작은 노점, 소유자 간판과 등불, 증축 반짝임. 가게 위치·이름·요금 유지.
- 말과 현황: 도깨비·여우·달토끼·꼬마 유령. 같은 상인 번호를 말과 현황에 표시한다. 능력 차이는 없다.
- 손패: 캐릭터 그림과 역할·효과가 보이는 종이 카드. 선택한 카드에는 체크와 초록 테두리를 함께 표시한다.
- 대결: 양쪽 장난과 교환 결과, 이전 점주에게 주는 금액을 영수증처럼 보여준다.
- 좁은 화면: 본문 폭을 유지하고 보드 안에서 가로로 둘러볼 수 있게 한다. 손패는 두 열을 유지한다.

## 미리보기

개발 서버 실행 후 홈의 **장터 먼저 구경하기** 또는 `/preview/goblin-market`에서 장터 보드·카드 골라보기·대결 결과를 혼자 확인할 수 있다. 예시 상인과 합성 상태만 사용하고 실제 방이나 다른 사람의 데이터에 접근하지 않는다. 카드 선택에는 실제 판정 함수를 사용하며 예시 점주는 바가지를 낸다. 미리보기에는 타이머를 적용하지 않는다.

## 에셋과 캡처

내장 **imagegen** 도구로 새로 생성했다. 외부 API/CLI나 기존 게임 이미지 편집은 사용하지 않았다. 원본 생성 파일을 프로젝트에 복사하고, 아래 경로만 앱에서 참조한다.

| 파일 | 용도 |
|---|---|
| [key-visual.png](../../public/games/goblin-market/key-visual.png) | 홈·로비·보드 중앙의 수채화 장터 |
| [market-sprites.png](../../public/games/goblin-market/market-sprites.png) | 투명 배경 4열×2행, 업종 노점 네 가지와 요괴 상인 네 명 |
| [보드 캡처](./assets/goblin-market-design-board.jpg) | 실제 브라우저의 PC 보드 |
| [모바일 캡처](./assets/goblin-market-design-mobile.jpg) | 390px 손패·둔갑 선택·교환 대상 선택 |

스프라이트는 CSS 위치로 각 셀을 표시한다. 캐릭터 셀의 좌우 여백을 조금 가려 이웃 셀의 그림이 보이지 않게 했다. 생성 이미지를 추가로 합성·수정하지 않았다.

## 확인

- 기존 전체 테스트 38개 파일, 200개 통과. 카드 확정·교환 대상·공개 정보 경계·재시도 검사를 유지했다.
- TypeScript 검사와 Next.js 16.2.11 프로덕션 빌드 통과.
- 실제 브라우저에서 보드, 카드 선택, 동일 단계 가게 선택, 교환과 이전 점주에게 3엽전 정산을 확인했다.
- 390px·320px에서 문서 가로 넘침이 없음을 확인했다. 보드 내부 가로 스크롤은 의도된 동작이다.
- 확인 시 브라우저 오류·경고 없음.
- 엔진·요금·카드 효과·인원·밤 수는 변경하지 않았다. 사람 플레이테스트의 재미·실제 시간 검증은 기존대로 남아 있다.

## 생성 프롬프트

### hero

Use case: illustration-story. Asset type: landscape key visual for an original Korean cozy board game "Goblin Night Market". Create a polished charming hand-painted gouache and watercolor children's picture-book illustration, landscape 3:2 composition. A tiny Korean night market made of miniature wooden stalls with softly curved tiled roofs, glowing apricot paper lanterns, woven baskets of rice cakes, a little fortune teller stand with paper charms, small fabric awnings. Four very cute round fantasy merchants: a mint-green baby dokkaebi with two tiny rounded horns and a coin purse; a fluffy apricot fox in a plum scarf holding a little mask; an ivory moon rabbit with sage scarf carrying rice cakes; a pale lavender tiny ghost holding a protective paper charm. A warm cream moon over a dusty periwinkle dusk sky, a few simple stars, little clouds and flowers around cobbled path. Friendly expressions, rosy cheeks, dot eyes, rounded pudgy silhouettes, tangible soft paper texture, rich but restrained handcrafted detail, soft edges and soft warm lighting, inviting and whimsical. Composition should read beautifully at a small size, with the four merchants gathered around market stalls in lower foreground, moon and roofs above, no typography or UI. Palette: warm parchment cream, sage green, dusty lavender, soft terracotta, apricot and gentle navy. No scary monsters, no aggressive neon, no photorealism, no logos, no text, no letters, no watermark.

### sprites

Use case: illustration-story. Asset type: EXACT 4-column by 2-row sprite atlas on a genuinely transparent background for a charming Korean board game. Canvas landscape 2:1, 8 equal square cells, each icon FULLY contained in its own square with generous transparent gutters, 70% cell occupancy, exact centered registration, no text, no grid lines, no scene background. Consistent hand-painted watercolor/gouache storybook miniature style, subtle paper grain within each object, soft rounded forms, delicate brown outlines, cozy pastel colors, tiny soft contact shadows with transparent surrounding canvas. Top row left to right: 1) little Korean rice cake stall with terracotta curved roof and stacked ivory rice cakes; 2) sage-roofed tiny general goods stall with a cloth bundle and brass teapot; 3) lavender-roofed fortune teller stall with a cream paper charm and small crystal; 4) dusty-blue little festival theater stall with an apricot lantern and a smiling theatrical mask. Bottom row left to right: 5) chubby mint-green baby dokkaebi, two tiny rounded horns, rosy cheeks, ivory belly, holding a bronze coin purse; 6) fluffy apricot fox with big tail and plum scarf, holding a small cream disguise mask; 7) round ivory moon rabbit with pink ears and sage scarf, holding two brass coins; 8) very cute pale lavender ghost with rounded waving arms, dot eyes, rosy cheeks, holding a rectangular cream protective talisman. All four characters front three-quarter full-body, friendly and mischievous, no lettering on talisman. All eight separate silhouettes, no overlaps between cells, no cropped ears or roofs. Palette cohesive warm ivory, soft sage, dusty mauve, terracotta and apricot. This must be a production-quality consistent sprite sheet, transparent background, no white mat, no checkerboard baked in, no labels.

## 소유자별 가게 외형 · 2026-11-03

가게 소유자에 따라 외형이 바뀐다. 캐릭터 배정은 기존 말·현황판과 같은 플레이어 배열 순서이며, 매 밤 바뀌는 행동 순서나 방문객과는 독립적이다. 기존 경기와 확장 경기 모두에 적용된다.

| 주인 | 지붕·장식 |
|---|---|
| 도깨비 | 세이지 지붕, 뿔, 파란 도깨비불, 방망이 |
| 구미호 | 주황 지붕, 여우 귀, 꼬리, 붉은 등불 |
| 달토끼 | 라벤더 지붕, 긴 귀, 초승달, 당근 화분 |
| 꼬마 유령 | 파란 지붕, 유령 간판, 커튼, 푸른 등불 |

- 각 주인에 먹거리·잡화·점술·놀거리 네 가지, 총 16종의 가게 그림을 추가했다. 업종은 진열 상품·칸 색·표식·범례로 읽는다. 가게 이름과 방문 요금도 계속 표시한다.
- 소유자 간판에는 기존 색·번호와 작은 캐릭터를 함께 표시한다. 증축은 받침과 반짝임·증축 글자로 표시한다. 빈 가게는 기존 업종별 그림을 쓴다.
- 계약으로 교환하거나 매입하면 그림과 간판을 즉시 갱신하고 560ms 가게 등장·680ms 간판 뒤집기 연출을 재생한다. 매각하면 빈 가게로 돌아간다. 최초 표시·동일 상태 재조회·방문객 이동에는 소유권 연출을 재생하지 않는다.
- 조작 패널만 단계별로 초기화하고 보드 인스턴스는 유지해, 카드 확정 후에도 교체 연출이 이어진다. 동작 줄이기 설정에서는 연출을 생략한다.
- 지름길·증축·매각 선택지에도 같은 주인 외형을 적용했다. 규칙·카드·수치와 서버 상태는 변경하지 않았다.

추가 에셋: [owned-shop-sprites.png](../../public/games/goblin-market/owned-shop-sprites.png), 1277×1231 RGBA, 원본 투명도 유지. 행은 도깨비·구미호·달토끼·유령, 열은 먹거리·잡화·점술·놀거리다. 생성 결과의 행 높이가 달라 CSS에서 실제 여백 경계(0·313·627·950·1231px)를 지정한다. 파일 자체를 잘라내거나 합성하지 않았다.

기존 `market-sprites.png`를 스타일 참조로 내장 imagegen 도구에 전달해 새 에셋을 만들었다. 생성 원본은 `/Users/hyoungmin/.codex/generated_images/01a17385-5435-7042-8809-975cb9a822e3/exec-935e7c42-d4cb-4072-887c-c140229907c3.png`에 보관하고 프로젝트에는 사본을 넣었다.

검증: Node 24.19.0에서 전체 40개 파일·233개 테스트, TypeScript 검사, Next.js 프로덕션 빌드 통과. 브라우저에서 실제 판정 함수를 통한 계약 교환과 이전 점주 3엽전 정산, 두 가게의 외형 갱신을 확인했다. 390px·320px에서 문서 가로 넘침이 없고 28칸의 이름·요금이 칸 밖으로 넘치지 않았다. 브라우저 오류·경고는 없었다. 새 회귀 검사는 방문객과 소유자 구분, 불연속 좌석 번호와 밤별 순서 변경, 단계 전환 시 보드 유지·선택 초기화, 동일 상태 재조회 시 연출 미반복, 매각과 동작 줄이기 설정을 포함한다. 최초 테스트 시 기본 Node 26의 Web Storage 처리로 JSDOM 환경에서 실패해, 기존 프로젝트 검증에 사용하던 설치된 Node 24로 실행했다.

### owned-shop-sprites 생성 프롬프트

Create ONE new game asset: a precisely registered square 4 column by 4 row transparent sprite atlas of SIXTEEN miniature Korean market stalls, in the same hand-painted warm watercolor/gouache storybook style as the reference. Reference role: visual style, building proportions, four shop category silhouettes and cute merchant identities. Do not reproduce the character row. All 16 cells contain only one stall each, no standing characters. Every cell is an equal square, each building centered on a shared baseline, approximately 76 percent cell width, transparent gutters on ALL sides, fully contained, no overlap between cells, no surrounding scene. Keep each stall compact with big readable roof silhouette and fewer bold accessories so it reads at 60px. Columns are fixed across ALL rows: column1 FOOD rice-cake shop (stacked ivory cakes in bamboo baskets); column2 GOODS general store (cloth bundle, brass teapot and crates); column3 FORTUNE charm shop (crystal ball and hanging moon talisman); column4 FUN theater (smiling cream theatrical mask and small drum). These front counter props should consistently distinguish the four shop categories even though roof colors now indicate owner. Rows are fixed owner styles: ROW1 DOKKAEBI owner: all four stalls have SAGE GREEN tiled roofs with two big round ivory horn finials, tiny blue spirit-flame lantern, little wooden club hanging at right; ROW2 FOX owner: all four stalls have TERRACOTTA/ORANGE roofs with two prominent triangular fox ear finials, red-orange lantern, large cream-tipped fluffy tail drape curving around one side; ROW3 MOON RABBIT owner: all four stalls have DUSTY LAVENDER roofs with two tall ivory pink-centered rabbit ear finials, a golden crescent moon sign and a little carrot planter; ROW4 LITTLE GHOST owner: all four stalls have DUSTY BLUE roofs with a rounded friendly ghost-shaped cream blank sign, pale gauzy curtain and little floating blue lantern. Preserve exact ordering and complete 4x4 matrix, 16 unique shops. Merchant identity should be immediately readable through roof color and big ear/horn/ghost silhouette, category immediately readable through front counter contents. Cozy cream wooden facade, warm brown ink edges, paper pigment texture, soft rounded handcrafted forms, polished attractive production game sprites, gentle contact shadow. Genuinely transparent alpha background, no white mat, no baked checkerboard, no grid lines, NO letters, NO words, NO labels, NO UI, NO watermark. Clear empty transparent gutter between every cell.
