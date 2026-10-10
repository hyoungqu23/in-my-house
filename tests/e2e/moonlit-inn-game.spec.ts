import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { MoonlitInnPlayerRoomView } from "../../src/modules/room/contracts";
test.use({ actionTimeout: 15000 });

test("four innkeepers draft, arrange, trade, finish and rematch across independent devices", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "Four portrait devices plus a desktop display are exercised together.");
  test.setTimeout(150000);
  const devices = Array.from({ length: 4 }, () => randomUUID());
  const contexts = await Promise.all(devices.map(() => browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const display = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  for (let i = 0; i < contexts.length; i++) {
    await contexts[i].addInitScript(id => localStorage.setItem("in-my-house:device-id", id), devices[i]);
    pages[i].on("pageerror", error => errors.push(error.message));
  }
  display.on("pageerror", error => errors.push(error.message));
  const host = pages[0];
  try {
    await host.goto("/");
    await host.getByRole("button", { name: "보름달 여관 열기", exact: true }).click();
    await expect(host.getByLabel("닉네임", { exact: true })).toBeVisible();
    const links = await host.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith("in-my-house:links:"))!;
      return JSON.parse(localStorage.getItem(key)!) as { code: string; joinUrl: string; displayUrl: string };
    });
    for (let i = 0; i < pages.length; i++) {
      if (i) await pages[i].goto(links.joinUrl);
      await pages[i].getByLabel("닉네임", { exact: true }).fill(`달빛주인${i + 1}`);
      await pages[i].getByRole("button", { name: "이 이름으로 들어가기", exact: true }).click();
      await expect(pages[i]).toHaveURL(new RegExp(`/room/${links.code}$`));
    }
    const view = async (i: number) => {
      const response = await pages[i].request.get(`/api/rooms/${links.code}/view?mode=private`, { headers: { "X-Device-Id": devices[i] } });
      expect(response.ok()).toBe(true);
      return await response.json() as MoonlitInnPlayerRoomView;
    };
    await expect(host.getByText("달빛주인4", { exact: true })).toBeVisible({ timeout: 10000 });
    await host.getByRole("button", { name: "모두 준비됨 · 여관 열기", exact: true }).click();
    await expect(host.getByTestId("inn-controls")).toBeVisible();
    expect((await view(0)).rulesVersion).toBe("balanced-1");
    await display.goto(links.displayUrl);
    await expect(display.getByRole("group", { name: /님의 공개 여관$/ })).toHaveCount(4);
    const pub = await display.request.get(`/api/rooms/${links.code}/view?mode=private`, { headers: { Authorization: `Display ${new URL(links.displayUrl).hash.slice(1)}` } });
    const publicJson = await pub.json();
    expect(publicJson.projection).toBe("public");
    expect(JSON.stringify(publicJson)).not.toContain('"hand"');
    expect(JSON.stringify(publicJson)).not.toContain('"weather"');
    for (let round = 0; round < 2; round++) for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      await page.getByRole("button", { name: "내 화면", exact: true }).click();
      const current = await view(i);
      const preferred = ["rabbit", "phoenix", "cat", "cloud"][i];
      const bundle = current.self.hand.find(c => c.guest.kind === preferred) ?? current.self.hand[0];
      await expect(page.locator(`[data-bundle-id="${bundle.id}"]`)).toBeVisible({ timeout: 10000 });
      await page.locator(`[data-bundle-id="${bundle.id}"]`).click();
      await page.getByRole("button", { name: "이 손님 맞이하기", exact: true }).click();
      await expect.poll(async () => { const next = await view(i); return Boolean(next.self.pickedId) || next.phaseKey !== current.phaseKey; }).toBe(true);
      if (round === 0 && i === 0) {
        await page.reload();
        await expect(page.getByText(/선택했어요. 모두 고르면/)).toBeVisible({ timeout: 10000 });
        expect((await view(0)).self.pickedId).toBe(bundle.id);
      }
    }
    await expect(host.getByRole("heading", { name: "보름달이 뜨기 전에", exact: true })).toBeVisible({ timeout: 10000 });
    const arranged = await view(0), furniture = arranged.players[0].furniture[0];
    await host.locator(`[data-item-id="${furniture.id}"]`).click();
    await host.locator('[data-room="5"]').click();
    await expect.poll(async () => (await view(0)).players[0].furniture.find(f => f.id === furniture.id)?.position).toBe(5);
    await host.reload();
    await expect(host.getByTestId("inn-controls")).toBeVisible();
    expect((await view(0)).players[0].furniture.find(f => f.id === furniture.id)?.position).toBe(5);
    for (const width of [320, 390, 768]) {
      await host.setViewportSize({ width, height: 900 });
      expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await host.setViewportSize({ width: 390, height: 844 });
    await host.evaluate(() => window.scrollTo(0, 0));
    await host.screenshot({ path: testInfo.outputPath("inn-arrange-mobile.png"), fullPage: true });
    for (const page of pages) {
      await page.getByRole("button", { name: "내 화면", exact: true }).click();
      await page.getByRole("button", { name: "보름달 맞을 준비 완료", exact: true }).click();
    }
    await expect.poll(async () => (await view(0)).phase, { timeout: 15000 }).toBe("INN_NIGHT");
    await host.getByRole("button", { name: "내 화면", exact: true }).click();
    await host.getByText("교환 제안 만들기", { exact: true }).click();
    await host.getByLabel("내 여관에 받을 자리", { exact: true }).selectOption("-1");
    const before = await view(0), giverId = before.players[0].furniture[0].id, receiverId = before.players[1].furniture[0].id;
    await host.getByRole("button", { name: "이 교환 제안하기", exact: true }).click();
    await pages[1].getByRole("button", { name: "내 화면", exact: true }).click();
    await expect(pages[1].getByTestId("inn-offer")).toBeVisible({ timeout: 10000 });
    await pages[1].getByLabel("달빛주인1의 제안 받을 자리", { exact: true }).selectOption("-1");
    await pages[1].getByRole("button", { name: "이 자리로 교환 수락", exact: true }).click();
    await expect.poll(async () => (await view(0)).players[0].traded).toBe(true);
    const after = await view(0);
    expect(after.players[0].furniture.some(f => f.id === receiverId)).toBe(true);
    expect(after.players[1].furniture.some(f => f.id === giverId)).toBe(true);
    expect(after.players.slice(0, 2).map(p => p.actionsLeft)).toEqual([1, 1]);
    // The proposer must see the received items before confirming the new board.
    // A ready request against their pre-trade revision is correctly rejected.
    await expect(host.getByText("오늘의 교환을 마쳤어요. 남은 정리권으로 잠자리를 마무리해 주세요.", { exact: true })).toBeVisible({ timeout: 10000 });
    await host.evaluate(() => window.scrollTo(0, 0));
    await host.screenshot({ path: testInfo.outputPath("inn-night-mobile.png"), fullPage: true });
    await expect(display.getByRole("heading", { name: "모두에게 잠자리를", exact: true })).toBeVisible();
    const bottomOfInns = await display.getByRole("group", { name: /님의 공개 여관$/ }).last().evaluate(element => element.getBoundingClientRect().bottom);
    expect(bottomOfInns).toBeLessThanOrEqual(1000);
    await display.screenshot({ path: testInfo.outputPath("inn-night-display.png"), fullPage: true });
    for (const [index, page] of pages.entries()) {
      await page.getByRole("button", { name: "내 화면", exact: true }).click();
      await page.getByRole("button", { name: "오늘의 잠자리 확정", exact: true }).click();
      await expect.poll(async () => { const next = await view(index); return next.phase === "GAME_OVER" || next.players[index].ready; }).toBe(true);
    }
    await expect(host.getByRole("region", { name: "최종 점수" })).toBeVisible({ timeout: 10000 });
    await expect(display.getByRole("region", { name: "최종 점수" })).toBeVisible({ timeout: 10000 });
    const final = await view(0);
    expect(final.result?.scores).toHaveLength(4);
    expect(final.result?.winnerSeats.length).toBeGreaterThan(0);
    for (const { score } of final.result!.scores) {
      expect(score.moon).toBeLessThanOrEqual(1);
      for (const guest of score.guests) expect(guest.base).toBe(guest.sleeping ? 2 : 0);
    }
    await host.getByRole("button", { name: "공개 화면", exact: true }).click();
    await host.getByRole("button", { name: "같은 사람들과 다시 하기", exact: true }).click();
    await host.getByRole("button", { name: "내 화면", exact: true }).click();
    await expect(host.getByRole("region", { name: "내 여행 꾸러미" })).toBeVisible({ timeout: 10000 });
    expect((await view(0)).self.hand).toHaveLength(3);
    expect((await view(0)).rulesVersion).toBe("balanced-1");
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); await display.close(); }
});
