import { expect, test } from "@playwright/test";

test("creates a room and removes the invite fragment before nickname entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /친구를 집으로/ })).toBeVisible();
  await page.getByRole("button", { name: "불을 끄고 시작하기" }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}\/join$/);
  await expect(page.getByRole("heading", { name: "누가 문을 두드렸나요?" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("three browser contexts finish a complete two-key match", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "multi-context match runs once");
  test.setTimeout(90_000);

  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [host, second, third] = await Promise.all(contexts.map((context) => context.newPage()));

  await host.goto("/");
  await host.getByRole("button", { name: "불을 끄고 시작하기" }).click();
  await expect(host.getByRole("heading", { name: "누가 문을 두드렸나요?" })).toBeVisible();
  const links = await host.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("in-my-house:links:"));
    return key ? JSON.parse(localStorage.getItem(key)!) as { joinUrl: string; code: string } : undefined;
  });
  expect(links).toBeTruthy();

  async function join(page: typeof host, nickname: string) {
    if (page !== host) await page.goto(links!.joinUrl);
    await page.getByLabel("닉네임").fill(nickname);
    await page.getByRole("button", { name: "이 이름으로 들어가기" }).click();
    await expect(page).toHaveURL(new RegExp(`/room/${links!.code}$`));
  }

  await join(host, "호스트 민수");
  await join(second, "손님 유진");
  await join(third, "손님 하나");
  await expect(host.getByText("손님 하나")).toBeVisible({ timeout: 8_000 });
  await host.getByRole("button", { name: "모두 준비됨 · 게임 시작" }).click();

  async function placeEmpty(page: typeof host) {
    if (await page.getByRole("button", { name: "빈 방" }).count() === 0) {
      await page.getByRole("button", { name: "내 화면" }).click();
    }
    await expect(page.getByRole("button", { name: "빈 방" }).first()).toBeVisible({ timeout: 8_000 });
    await page.getByRole("button", { name: "빈 방" }).first().click();
  }

  async function winRound() {
    await placeEmpty(host);
    await second.waitForTimeout(1_700);
    await placeEmpty(second);
    await third.waitForTimeout(1_700);
    await placeEmpty(third);
    await expect(host.getByLabel("빈 방을 몇 개까지 찾을 수 있나요?")).toBeVisible({ timeout: 8_000 });
    await host.getByLabel("빈 방을 몇 개까지 찾을 수 있나요?").fill("3");
    await host.getByRole("button", { name: "3 부르기" }).click();
    await host.getByRole("button", { name: "내 집 먼저" }).click();
    await expect(host.getByRole("button", { name: "손님 유진의 집" })).toBeVisible({ timeout: 5_000 });
    await host.getByRole("button", { name: "손님 유진의 집" }).click();
    await expect(host.getByRole("button", { name: "손님 하나의 집" })).toBeVisible({ timeout: 5_000 });
    await host.getByRole("button", { name: "손님 하나의 집" }).click();
  }

  await winRound();
  await expect(host.getByRole("button", { name: "빈 방" }).first()).toBeVisible({ timeout: 8_000 });
  await second.waitForTimeout(1_700);
  await third.waitForTimeout(1_700);
  await winRound();

  await host.getByRole("button", { name: "공개 화면" }).click();
  await expect(host.getByRole("heading", { name: "호스트 민수의 승리" })).toBeVisible({ timeout: 8_000 });

  await Promise.all(contexts.map((context) => context.close()));
});
