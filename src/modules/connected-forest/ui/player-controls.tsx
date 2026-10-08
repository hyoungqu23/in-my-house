"use client";

import { Check, Heart, Leaf, RotateCw, Sprout } from "lucide-react";
import type { ConnectedForestAction, ForestAnimalCard, ForestBoardCell, ForestTerrainKind } from "../domain/types";
import { connectedForestRules, FOREST_TERRAINS } from "../domain/content";
import { forestAnimal, forestPatternHexes } from "../domain/rules";
import type { ConnectedForestPlayerRoomView } from "@/modules/room/contracts";
import { useServerClock } from "@/shared/ui/use-server-clock";
import { forestDraftOptions, sameForestWelcome, type ForestDraft } from "./draft-options";
import { ForestBoard, ForestPatternArt } from "./forest-board";
import { FOREST_FRIENDS, FOREST_TERRAIN_ART, ForestAnimalArt, ForestTerrainArt } from "./forest-art";
import { ForestPaths, ForestPhaseHeader, ForestPauseNotice, ForestResult, ForestVisitTimeline } from "./public-board";
import styles from "./game.module.css";
import { ForestSoundToggle } from "./sound-toggle";

const EMPTY_DRAFT: ForestDraft = { useGoldenAcorn: false };

export function ConnectedForestPlayerControls({ view, busy, onAction, draft = EMPTY_DRAFT, onDraftChange }: {
  view: ConnectedForestPlayerRoomView;
  busy: boolean;
  onAction: (action: ConnectedForestAction | { type: "START_REMATCH" }) => void;
  draft?: ForestDraft;
  onDraftChange: (draft: ForestDraft) => void;
}) {
  const own = view.players.find((player) => player.seat === view.self.seat)!;
  const rules = connectedForestRules(view.rulesVersion);
  const now = useServerClock(view.serverNow);
  const canPick = view.self.legalActions.includes("LOCK_TERRAIN_PICK") && !busy;
  const canChooseVisit = view.self.legalActions.includes("CHOOSE_SEASON_VISIT") && !busy;
  const canRespond = view.self.legalActions.includes("RESOLVE_VISIT") && !busy;
  const { preview, choices, valid } = forestDraftOptions(view, draft);
  const welcome = draft.welcome && choices.find((choice) => sameForestWelcome(choice, draft.welcome!));
  const welcomeCard = welcome ? view.self.activeAnimals.find((card) => card.id === welcome.animalCardId) : undefined;
  const currentVisit = view.self.currentVisit;
  const stayHexId = draft.stayHexId && view.self.stayHexIds.includes(draft.stayHexId) ? draft.stayHexId : view.self.stayHexIds[0];
  const pickedCard = view.self.hand.find((card) => card.id === draft.cardId);
  const selectedVisitAnimal = view.self.visitAnimalCardIds.includes(draft.visitAnimalCardId!)
    ? draft.visitAnimalCardId : view.self.visitAnimalCardIds[0];
  const visitTargetSeats = view.self.visitTargetSeats ?? view.self.neighborSeats;
  const targetSeat = visitTargetSeats.includes(draft.targetSeat!) ? draft.targetSeat : visitTargetSeats[0];
  const stayHearts = view.self.stayHearts ?? rules.stayReceiverHearts;
  const resetWelcome = (update: Partial<ForestDraft>) => onDraftChange({ ...draft, ...update, welcome: undefined });
  const highlighted = welcomeCard && welcome ? forestPatternHexes(welcomeCard, welcome.originHexId, welcome.rotation).flatMap((cell) => cell ? [cell.hexId] : []) : [];
  const lockedCard = view.self.hand.find((card) => card.id === view.self.lockedPick?.cardId);
  const displayedBoard: ForestBoardCell[] = view.self.lockedPick && lockedCard
    ? own.board.map((cell) => cell.hexId === view.self.lockedPick!.hexId ? { ...cell, terrain: view.self.lockedPick!.useGoldenAcorn ? undefined : lockedCard.kind, acornTerrain: view.self.lockedPick!.useGoldenAcorn ? view.self.lockedPick!.acornTerrain : undefined } : cell)
    : canPick ? preview.board : own.board;
  const residentHexIds = welcome ? choices.filter((choice) => choice.animalCardId === welcome.animalCardId && choice.originHexId === welcome.originHexId && choice.rotation === welcome.rotation).map((choice) => choice.residentHexId) : [];
  const boardLegalIds = canPick ? welcome ? residentHexIds : view.self.legalPlacementHexIds : canRespond ? view.self.stayHexIds : [];
  const boardSelect = canPick ? (hexId: string) => {
    if (welcome) onDraftChange({ ...draft, welcome: { ...welcome, residentHexId: hexId } });
    else resetWelcome({ hexId });
  } : canRespond ? (hexId: string) => onDraftChange({ ...draft, stayHexId: hexId }) : undefined;
  const deadline = view.phase === "SEASON_VISIT_RESPOND" ? view.self.respondEndsAt : view.phaseEndsAt;
  const lock = () => {
    if (!valid || !canPick || (draft.welcome && !welcome)) return;
    onAction({ type: "LOCK_TERRAIN_PICK", cardId: draft.cardId!, hexId: draft.hexId!, useGoldenAcorn: draft.useGoldenAcorn,
      acornTerrain: draft.useGoldenAcorn ? draft.acornTerrain : undefined, refreshAnimalCardId: draft.refreshAnimalCardId, welcome: welcome || undefined });
  };

  return <section className={styles.game} data-testid="forest-controls">
    <ForestPhaseHeader view={view} deadline={deadline} /><ForestSoundToggle eventKey={`${view.phaseKey}:${Boolean(view.self.lockedPick)}`} /><ForestPauseNotice view={view} /><ForestResult view={view} />
    {view.pause && <div className={styles.waiting}><p>3분 동안 연결이 돌아오지 않으면 이번 판을 마칠 수 있어요.</p><button className={styles.secondary} disabled={busy || !view.self.legalActions.includes("CLAIM_FORFEIT")} onClick={() => onAction({ type: "CLAIM_FORFEIT" })}>{now < Date.parse(view.pause.forfeitClaimAt) ? `${Math.ceil((Date.parse(view.pause.forfeitClaimAt) - now) / 1000)}초 뒤 종료 가능` : "승자 없이 이번 판 마치기"}</button></div>}
    <div className={styles.ownForest}>
      <div className={styles.forestHeading}><h2>나의 작은 숲</h2><span><Heart size={17} /> {own.score.total} <small>· 잎 {own.score.leafHearts} (숲길 {own.score.leafHeartsFromPaths})</small></span></div>
      <ForestBoard board={displayedBoard} figures={own.figures} label="나의 19칸 숲" legalHexIds={boardLegalIds}
        selectedHexId={canRespond ? stayHexId : welcome ? welcome.residentHexId : draft.hexId ?? view.self.lockedPick?.hexId}
        previewHexId={valid ? draft.hexId : view.self.lockedPick?.hexId} highlightedHexIds={highlighted} onSelect={boardSelect} />
      {canPick && <p className={styles.boardHint}>{welcome ? "밝은 테두리 안에서 친구가 앉을 자리를 골라요." : pickedCard ? "점선 칸을 누르면 조각을 미리 놓아볼 수 있어요." : "아래 바구니에서 조각을 먼저 골라요."}</p>}
      {view.self.lockedPick && <p className={styles.waiting} role="status"><Check size={18} /> 선택을 잠갔어요. 다른 친구들이 고르면 함께 놓습니다.</p>}
    </div>

    {view.phase === "SEASON_DRAFT" && !view.self.lockedPick && <>
      <section className={styles.basket} aria-label="내 지형 카드"><header><h2>오늘의 숲 바구니</h2><span>하나를 고르고 이웃에게 넘겨요</span></header><div className={styles.hand}>
        {view.self.hand.map((card, index) => <button type="button" data-card-id={card.id} key={card.id} aria-pressed={draft.cardId === card.id} disabled={!canPick} aria-label={`지형 카드 ${index + 1} · ${FOREST_TERRAIN_ART[card.kind].name}`} onClick={() => resetWelcome({ cardId: card.id })}>
          <ForestTerrainArt kind={card.kind} decorative /><strong>{FOREST_TERRAIN_ART[card.kind].name}</strong><small>{FOREST_TERRAIN_ART[card.kind].description}</small>
        </button>)}
      </div></section>
      <section className={styles.animals} aria-label="나의 동물 서식지"><header><h2>숲에 오고 싶은 친구들</h2><span>계절마다 한 친구를 맞이해요</span></header><div className={styles.animalCards}>
        {view.self.activeAnimals.map((card) => {
          const matches = choices.filter((choice) => choice.animalCardId === card.id);
          const isWelcomed = welcome?.animalCardId === card.id;
          return <article key={card.id} data-animal-card-id={card.id} style={{ backgroundColor: FOREST_FRIENDS[card.speciesId].ground }}>
            <div className={styles.animalHeading}><ForestAnimalArt species={card.speciesId} decorative /><div><h3>{card.name}</h3><span><Heart size={14} /> {card.hearts}</span></div></div>
            <ForestPatternArt card={card} rotation={isWelcomed ? welcome!.rotation : draft.patternRotations?.[card.id] ?? 0} /><p className={styles.animalCaption}>이 모양을 채우면 찾아와요 · {FOREST_TERRAIN_ART[card.visitorTerrain].name}에서 쉬어요</p>
            <button type="button" className={styles.rotatePattern} aria-label={`${card.name} 서식지 돌려보기`} disabled={!canPick || isWelcomed} onClick={() => onDraftChange({ ...draft, patternRotations: { ...draft.patternRotations, [card.id]: ((draft.patternRotations?.[card.id] ?? 0) + 1) % 6 as 0 | 1 | 2 | 3 | 4 | 5 } })}><RotateCw size={14} /> 서식지 돌려보기</button>
            <button type="button" className={styles.secondary} disabled={!canPick || !matches.length} aria-pressed={isWelcomed} onClick={() => onDraftChange({ ...draft, welcome: isWelcomed ? undefined : matches[0] })}>
              {isWelcomed ? "맞이하기 선택 취소" : matches.length ? `${card.name} 맞이하기` : view.self.welcomedThisSeason ? "이번 계절은 이미 맞이했어요" : "서식지를 더 꾸며주세요"}
            </button>
          </article>;
        })}
      </div>{welcome && welcomeCard && <div className={styles.welcomeSummary}><p><strong>{welcomeCard.name}를 맞이할 준비가 됐어요.</strong><br />서식지 {welcomeCard.cells.length}칸이 빛나요. 친구가 앉을 자리는 숲에서 바꿀 수 있어요.</p><button type="button" className={styles.secondary} onClick={() => {
        const matches = choices.filter((choice) => choice.animalCardId === welcome.animalCardId);
        const poses = matches.filter((choice, index) => matches.findIndex((other) => other.originHexId === choice.originHexId && other.rotation === choice.rotation) === index);
        const index = poses.findIndex((choice) => choice.originHexId === welcome.originHexId && choice.rotation === welcome.rotation);
        onDraftChange({ ...draft, welcome: poses[(index + 1) % poses.length] });
      }}><RotateCw size={16} /> 다른 완성 자리 보기</button></div>}</section>
      <details className={styles.tools}><summary><Sprout size={17} /> 숲을 도와주는 작은 선물</summary>
        <label className={styles.toggle}><input type="checkbox" checked={draft.useGoldenAcorn} disabled={!canPick || !view.self.goldenAcornAvailable} onChange={(event) => resetWelcome({ useGoldenAcorn: event.currentTarget.checked, acornTerrain: event.currentTarget.checked ? draft.acornTerrain ?? pickedCard?.kind ?? "TREE" : undefined })} /><span>황금 도토리 · 원하는 지형으로 바꾸기 {view.self.goldenAcornAvailable ? "(게임당 한 번)" : "(사용했어요)"}</span></label>
        {draft.useGoldenAcorn && <div className={styles.acornChoices} role="group" aria-label="도토리의 지형">{FOREST_TERRAINS.map((kind) => <button type="button" key={kind} aria-pressed={draft.acornTerrain === kind} disabled={!canPick} onClick={() => resetWelcome({ acornTerrain: kind })}><ForestTerrainArt kind={kind} decorative /><span>{FOREST_TERRAIN_ART[kind].name}</span></button>)}</div>}
        <label className={styles.refresh}>새 보금자리 찾기 · 동물 카드 교환<select aria-label="교환할 동물" disabled={!canPick || !view.self.animalRefreshAvailable || view.pickIndex !== 0} value={draft.refreshAnimalCardId ?? ""} onChange={(event) => resetWelcome({ refreshAnimalCardId: event.currentTarget.value ? event.currentTarget.value as ForestAnimalCard["id"] : undefined })}><option value="">교환하지 않기</option>{view.self.activeAnimals.map((card) => <option key={card.id} value={card.id}>{card.name} 카드 교환</option>)}</select><small>게임당 한 번, 계절의 첫 바구니에서만 사용할 수 있어요.</small></label>
      </details>
      <div className={styles.lockRow}><p role="status">{valid ? `${FOREST_TERRAIN_ART[(draft.useGoldenAcorn ? draft.acornTerrain : pickedCard?.kind) as ForestTerrainKind].name} 조각${welcomeCard ? `과 ${welcomeCard.name}` : ""}을 준비했어요.` : "조각 하나와 빈칸 하나를 골라주세요."}</p><button type="button" className={styles.primary} disabled={!canPick || !valid || Boolean(draft.welcome && !welcome)} onClick={lock}><Check size={18} /> {busy ? "선택을 보내는 중…" : "선택 잠그기"}</button></div>
    </>}

    {view.phase === "SEASON_VISIT_SELECT" && <section className={styles.visit} aria-label="계절 방문 보내기"><h2>어느 이웃에게 놀러 갈까요?</h2>
      {view.self.visitSelection !== undefined ? <p className={styles.waiting}>방문 준비를 마쳤어요. 다른 이웃을 기다립니다.</p> : <>
        {rules.visitRouting === "ALTERNATE" && <p className={styles.boardHint}>{visitTargetSeats.length === 1 ? "이번에는 덜 놀러 갔던 이웃을 만나요. 두 숲에 골고루 인사해요." : "두 이웃에게 같은 만큼 인사했어요. 이번에는 누구에게 갈까요?"}</p>}
        <div className={styles.visitAnimals}>{view.self.visitAnimalCardIds.map((id) => {
          const card = forestAnimal(id)!;
          return <button type="button" className={styles.friendChoice} key={id} aria-pressed={selectedVisitAnimal === id} disabled={!canChooseVisit} onClick={() => onDraftChange({ ...draft, visitAnimalCardId: id })}><ForestAnimalArt species={card.speciesId} decorative /><strong>{card.name}</strong><small>편하게 쉬는 지형 · {FOREST_TERRAIN_ART[card.visitorTerrain].name}</small></button>;
        })}</div><div className={styles.neighbors}>{view.self.neighborSeats.map((seat) => {
          const player = view.players.find((candidate) => candidate.seat === seat)!;
          const path = view.neighborPaths.find((candidate) => [candidate.lowSeat, candidate.highSeat].includes(view.self.seat) && [candidate.lowSeat, candidate.highSeat].includes(seat))!;
          return <button type="button" key={seat} disabled={!canChooseVisit || !visitTargetSeats.includes(seat)} aria-pressed={targetSeat === seat} onClick={() => onDraftChange({ ...draft, targetSeat: seat })}><strong>{player.nickname}님의 숲</strong><span>우리 숲길 {path.length}/{rules.pathCap} · 주민 {player.figures.filter((figure) => figure.kind === "RESIDENT").length}</span><small>{visitTargetSeats.includes(seat) ? `머물거나 산책하면 내게 잎 ${rules.staySenderLeaves}개${path.length === rules.pathCap - 1 ? ` · 길 완성 시 +${rules.pathCompletionSenderLeaves}` : ""}` : "다른 이웃에게 먼저 인사해요"}</small></button>;
        })}</div><button type="button" className={styles.primary} disabled={!canChooseVisit || !selectedVisitAnimal || targetSeat === undefined} onClick={() => onAction({ type: "CHOOSE_SEASON_VISIT", animalCardId: selectedVisitAnimal!, targetSeat: targetSeat! })}>이웃에게 놀러 보내기</button>
      </>}
    </section>}

    {view.phase === "SEASON_VISIT_RESPOND" && <section className={styles.visit} aria-label="방문객 맞이하기">
      {currentVisit ? <><div className={styles.visitorPortrait}><ForestAnimalArt species={currentVisit.speciesId} /><div><span>방문 {view.self.visitQueueIndex + 1}/{view.self.visitQueueTotal}</span><h2>{view.players.find((player) => player.seat === currentVisit.sourceSeat)?.nickname}님의 {FOREST_FRIENDS[currentVisit.speciesId].name}</h2><p>{FOREST_TERRAIN_ART[currentVisit.visitorTerrain].name} 조각이 있는 숲에서 쉬고 싶어요.</p></div></div>
        <div className={styles.visitChoices}><button type="button" className={styles.secondary} disabled={!canRespond || !stayHexId} onClick={() => onAction({ type: "RESOLVE_VISIT", visitId: currentVisit.visitId, choice: "STAY", targetHexId: stayHexId })}><Heart size={19} /><strong>우리 숲에 머물기</strong><span>하트 {stayHearts}개{stayHearts > rules.stayReceiverHearts ? ` (새 종류 +${stayHearts - rules.stayReceiverHearts})` : ""} · 숲에서 밝은 자리를 골라요</span></button><button type="button" className={styles.secondary} disabled={!canRespond || !view.self.canWalk} onClick={() => onAction({ type: "RESOLVE_VISIT", visitId: currentVisit.visitId, choice: "WALK" })}><Leaf size={19} /><strong>함께 산책하기</strong><span>잎 {rules.walkReceiverLeaves}개 · 숲길 완성 시 +{rules.pathCompletionReceiverLeaves}</span></button></div>
        <p className={styles.boardHint}>시간이 지나면 머물 수 있는 자리, 산책 순서로 자동 인사해요.</p>
      </> : <div className={styles.waiting}><Leaf size={22} /><p>우리 숲의 인사를 마쳤어요. 이웃들이 돌아올 때까지 잠깐 쉬어요.</p></div>}
    </section>}
    {view.phase === "SEASON_REVEAL" && <p className={styles.waiting} role="status">이번 계절을 함께 기억하는 중… 다음 바구니가 곧 도착해요.</p>}
    <ForestPaths view={view} /><ForestVisitTimeline view={view} />
    {view.viewer.legalAdministrativeActions.includes("START_REMATCH") && <button type="button" className={styles.primary} disabled={busy} onClick={() => onAction({ type: "START_REMATCH" })}>같은 사람들과 새 숲 만들기</button>}
    <details className={styles.rules}><summary>숲길 놀이 방법</summary><ol><li>다섯 계절마다 지형을 세 번 골라요. 첫 조각은 중앙, 다음 조각은 놓인 지형 옆에 놓습니다.</li><li>동물 카드의 모양을 맞추면 계절마다 한 친구가 숲에 찾아와요. 완성 모양은 돌려서 맞춰도 됩니다.</li><li>계절 끝에는 아직 놀러 가지 않은 주민 한 마리를 좌우 이웃에게 보내요. 주민은 내 숲에도 남습니다.{rules.visitRouting === "ALTERNATE" && " 전에 덜 방문한 이웃부터 인사하고, 횟수가 같으면 둘 중 고를 수 있어요."}</li><li>놀러 온 친구를 숲에 머물게 하면 하트 {rules.stayReceiverHearts}개를 받아요.{Boolean(rules.visitorDiversityHearts) && ` 처음 ${rules.visitorDiversityCap ?? "모든"}종류의 새 방문객은 하트 ${rules.visitorDiversityHearts}개를 더 받아요.`} 함께 걸으면 잎 {rules.walkReceiverLeaves}개와 공동 숲길 한 칸을 얻어요. {rules.pathCap}칸을 완성하면 둘 다 잎 {rules.pathCompletionReceiverLeaves}개를 추가로 받아요. 잎도 한 개에 하트 한 개예요.</li><li>주민·방문객·잎을 합산하고, 다섯 지형을 각각 두 개 이상 놓으면 하트 {rules.balanceBonusHearts}개를 더 받아요. 동점은 방문객 수, 주민 수 순서로 결정합니다.</li></ol></details>
  </section>;
}
