import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import type { ConnectedForestAction } from "../../src/modules/connected-forest/domain/types";
import type { ConnectedForestPlayerRoomView, ConnectedForestPublicRoomView } from "../../src/modules/room/contracts";
import { forestDraftOptions, type ForestDraft } from "../../src/modules/connected-forest/ui/draft-options";
import { CONNECTED_FOREST_CURRENT_RULES_VERSION, FOREST_HEXES } from "../../src/modules/connected-forest/domain/content";
import { forestHexDistance, forestPatternHexes, forestTerrainAt } from "../../src/modules/connected-forest/domain/rules";

// Bots plan only from their own projection. Favor progress toward a habitat,
// so the end-to-end match exercises animal welcomes and incoming visits too.
function plannedPick(view: ConnectedForestPlayerRoomView) {
  return view.self.hand.flatMap((card, cardIndex) => view.self.legalPlacementHexIds.map((hexId) => {
    const draft: ForestDraft = { cardId: card.id, hexId, useGoldenAcorn: false };
    const { preview, choices } = forestDraftOptions(view, draft);
    const terrain = new Map(preview.board.map((cell) => [cell.hexId, forestTerrainAt(cell)]));
    let progress = 0;
    for (const animal of preview.activeAnimals) for (const origin of FOREST_HEXES) for (let rotation = 0; rotation < 6; rotation += 1) {
      const pattern = forestPatternHexes(animal, origin.id, rotation);
      if (pattern.some((cell) => !cell) || !pattern.some((cell) => cell?.hexId === hexId && cell.terrain === card.kind)) continue;
      if (pattern.some((cell) => terrain.get(cell!.hexId) !== undefined && terrain.get(cell!.hexId) !== cell!.terrain)) continue;
      progress = Math.max(progress, pattern.filter((cell) => terrain.get(cell!.hexId) === cell!.terrain).length);
    }
    const diversity = preview.board.filter((cell) => cell.terrain === card.kind).length < 2 ? 14 : 0;
    const weight = (choices.length ? 1000 : 0) + progress * 12 + diversity - forestHexDistance(hexId) - cardIndex / 100;
    return { draft, choices, weight };
  })).sort((first, second) => second.weight - first.weight)[0];
}

async function playForest(browser: Browser, playerCount: 4 | 6, testInfo: TestInfo) {
  const devices = Array.from({ length: playerCount }, () => randomUUID());
  const contexts = await Promise.all(devices.map(() => browser.newContext({ viewport: { width: 375, height: 844 }, reducedMotion: playerCount === 6 ? "reduce" : "no-preference" })));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  for (let index = 0; index < contexts.length; index += 1) {
    await contexts[index].addInitScript((device) => localStorage.setItem("in-my-house:device-id", device), devices[index]);
    pages[index].on("pageerror", (error) => errors.push(error.message));
  }
  const host = pages[0];
  let display: Page | undefined;
  try {
    await host.goto("/");
    await host.getByRole("button", { name: "나의 숲 만들기", exact: true }).click();
    await expect(host.getByLabel("닉네임", { exact: true })).toBeVisible();
    const links = await host.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("in-my-house:links:"))!;
      return JSON.parse(localStorage.getItem(key)!) as { code: string; joinUrl: string; displayUrl: string };
    });
    for (let index = 0; index < pages.length; index += 1) {
      if (index) await pages[index].goto(links.joinUrl);
      await pages[index].getByLabel("닉네임", { exact: true }).fill(`숲친구${index + 1}`);
      await pages[index].getByRole("button", { name: "이 이름으로 들어가기", exact: true }).click();
      await expect(pages[index]).toHaveURL(new RegExp(`/room/${links.code}$`));
    }
    await expect(host.getByText(`숲친구${playerCount}`, { exact: true })).toBeVisible({ timeout: 8000 });
    await host.getByRole("button", { name: "모두 준비됨 · 숲길 시작", exact: true }).click();
    await expect(host.getByTestId("forest-controls")).toBeVisible();
    display = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await display.goto(links.displayUrl);
    await expect(display.getByRole("heading", { name: "새싹의 작은 숲", exact: true })).toBeVisible();
    await expect(display.getByRole("group", { name: /님의 공개 숲$/ })).toHaveCount(playerCount);
    await expect(display.getByRole("region", { name: "내 지형 카드" })).toHaveCount(0);

    const view = async (index: number) => {
      const response = await pages[index].request.get(`/api/rooms/${links.code}/view?mode=private`, { headers: { "X-Device-Id": devices[index] } });
      expect(response.ok()).toBe(true);
      return await response.json() as ConnectedForestPlayerRoomView;
    };
    const apiAction = async (index: number, action: ConnectedForestAction) => {
      const clientActionId = randomUUID();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const fresh = await view(index);
        const response = await pages[index].request.post(`/api/rooms/${links.code}/actions`, { headers: { "X-Device-Id": devices[index] }, data: { clientActionId, expectedVersion: fresh.room.version, action } });
        const data = await response.json();
        if (response.ok()) return;
        expect(data.code).toBe("STALE_VERSION");
      }
      throw new Error("Forest action did not commit");
    };
    const firstMatch = await view(0);
    expect(firstMatch.rulesVersion).toBe(CONNECTED_FOREST_CURRENT_RULES_VERSION);
    expect(firstMatch.matchId).toMatch(/^[\da-f-]{36}$/);
    let loops = 0;
    let usedAcorn = false;
    let refreshedAnimal = false;
    let capturedVisit = false;
    while (loops++ < 120) {
      const status = await view(0);
      if (status.phase === "GAME_OVER") break;
      if (status.phase === "SEASON_REVEAL") { await host.waitForTimeout(200); continue; }
      for (let index = 0; index < pages.length; index += 1) {
        const current = await view(index);
        const actions = current.self.legalActions;
        if (actions.includes("LOCK_TERRAIN_PICK")) {
          const selected = plannedPick(current);
          if (index === 0) {
            const page = pages[index];
            await page.getByRole("button", { name: "내 화면", exact: true }).click();
            const card = page.locator(`[data-card-id="${selected.draft.cardId}"]`);
            await expect(card).toBeEnabled({ timeout: 8000 });
            await card.click();
            const hex = page.locator(`[data-testid="forest-controls"] [data-hex-id="${selected.draft.hexId}"]`);
            await expect(hex).toBeEnabled();
            await hex.click();
            if (!usedAcorn) {
              await page.getByText("숲을 도와주는 작은 선물", { exact: true }).click();
              await page.getByRole("checkbox").check();
              await page.getByRole("combobox", { name: "교환할 동물" }).selectOption(current.self.activeAnimals[1].id);
              usedAcorn = true;
              refreshedAnimal = true;
            } else if (selected.choices[0]) {
              await page.locator(`[data-animal-card-id="${selected.choices[0].animalCardId}"] button`).filter({ hasText: "맞이하기" }).click();
            }
            if (current.seasonIndex === 0 && current.pickIndex === 0) {
              await page.getByRole("button", { name: /서식지 돌려보기$/ }).first().click();
              await page.getByRole("button", { name: "공개 화면", exact: true }).click();
              await expect(page.getByRole("region", { name: "내 지형 카드" })).toHaveCount(0);
              await page.getByRole("button", { name: "내 화면", exact: true }).click();
              await expect(card).toHaveAttribute("aria-pressed", "true");
              await page.screenshot({ path: testInfo.outputPath(`forest-${playerCount}-mobile.png`), fullPage: true });
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
              const undersized = await page.locator("main button:enabled").evaluateAll((nodes) => nodes.filter((node) => {
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && (rect.width < 44 || rect.height < 44);
              }).map((node) => node.getAttribute("aria-label") || node.textContent));
              expect(undersized).toEqual([]);
              await page.reload();
              // Unsubmitted choices need not survive a full reload; reselect before locking.
              await expect(card).toBeEnabled();
              await card.click();
              await hex.click();
              await page.getByText("숲을 도와주는 작은 선물", { exact: true }).click();
              await page.getByRole("checkbox").check();
              await page.getByRole("combobox", { name: "교환할 동물" }).selectOption(current.self.activeAnimals[1].id);
            }
            await page.getByRole("button", { name: "선택 잠그기", exact: true }).click();
            await expect(page.getByText("선택을 잠갔어요. 다른 친구들이 고르면 함께 놓습니다.")).toBeVisible({ timeout: 8000 });
          } else {
            await apiAction(index, { type: "LOCK_TERRAIN_PICK", ...selected.draft, cardId: selected.draft.cardId!, hexId: selected.draft.hexId!, welcome: selected.choices[0] });
          }
        } else if (actions.includes("CHOOSE_SEASON_VISIT")) {
          if (index === 0) {
            await host.getByRole("button", { name: "내 화면", exact: true }).click();
            const button = host.getByRole("button", { name: "이웃에게 놀러 보내기", exact: true });
            await expect(button).toBeEnabled({ timeout: 8000 });
            const committed = host.waitForResponse((response) => response.url().endsWith("/actions") && response.request().method() === "POST" && response.ok());
            await button.click();
            await committed;
          } else await apiAction(index, { type: "CHOOSE_SEASON_VISIT", animalCardId: current.self.visitAnimalCardIds[0], targetSeat: current.self.visitTargetSeats[0] });
        } else if (actions.includes("RESOLVE_VISIT")) {
          const targetHexId = current.self.stayHexIds[0];
          if (index === 0) {
            await host.getByRole("button", { name: "내 화면", exact: true }).click();
            const button = host.getByRole("button", { name: targetHexId ? /우리 숲에 머물기/ : /함께 산책하기/ });
            await expect(button).toBeEnabled({ timeout: 8000 });
            if (!capturedVisit) {
              await host.screenshot({ path: testInfo.outputPath(`forest-${playerCount}-visit.png`), fullPage: true });
              expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
              capturedVisit = true;
            }
            const committed = host.waitForResponse((response) => response.url().endsWith("/actions") && response.request().method() === "POST" && response.ok());
            await button.click();
            await committed;
          } else await apiAction(index, { type: "RESOLVE_VISIT", visitId: current.self.currentVisit!.visitId, choice: targetHexId ? "STAY" : "WALK", targetHexId });
        }
      }
    }
    const final = await view(0);
    expect(final.rulesVersion).toBe(CONNECTED_FOREST_CURRENT_RULES_VERSION);
    expect(final.phase).toBe("GAME_OVER");
    expect(final.result?.scores).toHaveLength(playerCount);
    expect(final.result?.winnerSeats?.length).toBeGreaterThan(0);
    expect(usedAcorn && refreshedAnimal).toBe(true);
    expect(capturedVisit).toBe(true);
    expect(final.self.goldenAcornAvailable).toBe(false);
    expect(final.self.animalRefreshAvailable).toBe(false);
    for (const player of final.players) expect(player.board.filter((cell) => cell.terrain || cell.acornTerrain)).toHaveLength(15);
    expect(final.players[0].board.find((cell) => cell.hexId === FOREST_HEXES[0].id)?.acornTerrain).toBeTruthy();
    await host.getByRole("button", { name: "공개 화면", exact: true }).click();
    await expect(host.getByRole("region", { name: "최종 점수" })).toBeVisible({ timeout: 8000 });
    await expect(display.getByRole("region", { name: "최종 점수" })).toBeVisible({ timeout: 8000 });
    await display.screenshot({ path: testInfo.outputPath(`forest-${playerCount}-display.png`), fullPage: true });
    const displayResponse = await display.request.get(`/api/rooms/${links.code}/view?mode=private`, { headers: { Authorization: `Display ${new URL(links.displayUrl).hash.slice(1)}` } });
    const publicView = await displayResponse.json() as ConnectedForestPublicRoomView;
    expect(publicView.projection).toBe("public");
    expect(JSON.stringify(publicView)).not.toContain('"activeAnimals"');
    await host.getByRole("button", { name: "같은 사람들과 다시 하기", exact: true }).click();
    await host.getByRole("button", { name: "내 화면", exact: true }).click();
    await expect(host.getByRole("heading", { name: "새싹의 작은 숲", exact: true })).toBeVisible({ timeout: 8000 });
    const rematch = await view(0);
    expect(rematch.matchId).toMatch(/^[\da-f-]{36}$/);
    expect(rematch.matchId).not.toBe(firstMatch.matchId);
    expect(rematch.phaseKey).not.toBe(firstMatch.phaseKey);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await display?.close();
  }
}

for (const count of [4, 6] as const) test(`${count} forest players finish five seasons and start a rematch`, async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "multi-context mobile match runs once per player count");
  test.setTimeout(240000);
  await playForest(browser, count, testInfo);
});
