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

test("three guests catch the Stranger and end suspicious invite by majority vote", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "multi-context match runs once");
  test.setTimeout(120_000);

  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host] = pages;
  const nicknames = ["초대 민수", "초대 유진", "초대 하나"];

  await host.goto("/");
  await host.getByRole("button", { name: "초대장 보내기" }).click();
  await expect(host.getByRole("heading", { name: "누가 문을 두드렸나요?" })).toBeVisible();
  const links = await host.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("in-my-house:links:"));
    return key ? JSON.parse(localStorage.getItem(key)!) as { joinUrl: string; code: string } : undefined;
  });
  expect(links).toBeTruthy();

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (index > 0) await page.goto(links!.joinUrl);
    await page.getByLabel("닉네임").fill(nicknames[index]);
    await page.getByRole("button", { name: "이 이름으로 들어가기" }).click();
    await expect(page).toHaveURL(new RegExp(`/room/${links!.code}$`));
  }

  await expect(host.getByText(nicknames[2])).toBeVisible({ timeout: 8_000 });
  await host.getByRole("button", { name: "모두 준비됨 · 초대장 공개" }).click();

  for (const [index, page] of pages.entries()) {
    await expect(page.getByPlaceholder("짧은 단서 입력").first()).toBeVisible({ timeout: 8_000 });
    const inputs = page.getByPlaceholder("짧은 단서 입력");
    await inputs.nth(0).fill(["따뜻한 느낌", "바삭한 느낌", "즐거운 느낌"][index]);
    await inputs.nth(1).fill(["주말 생각", "저녁 생각", "친구 생각"][index]);
    await page.getByRole("button", { name: "단서 몰래 제출하기" }).click();
    await page.waitForTimeout(1_700);
  }

  const strangerIndex = await Promise.any(pages.map(async (page, index) => {
    await expect(page.getByText("당신은 Stranger")).toBeVisible({ timeout: 5_000 });
    return index;
  }));
  const guestIndex = pages.findIndex((_, index) => index !== strangerIndex);
  const secretWord = (await pages[guestIndex].locator(".role-card h2").textContent())?.trim();
  expect(secretWord).toBeTruthy();

  await expect(host.getByRole("heading", { name: "가장 수상한 사람을 지목하세요" })).toBeVisible({ timeout: 55_000 });
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    await page.getByRole("button", { name: "내 화면" }).click();
    await expect(page.getByText("누가 Stranger일까요?")).toBeVisible({ timeout: 8_000 });
    const targetName = index === strangerIndex
      ? nicknames[(index + 1) % pages.length]
      : nicknames[strangerIndex];
    await page.getByRole("button", { name: targetName, exact: true }).click();
    await page.waitForTimeout(1_700);
  }

  const strangerPage = pages[strangerIndex];
  await expect(strangerPage.getByText("비밀 단어를 맞혀보세요")).toBeVisible({ timeout: 8_000 });
  const guessButtons = strangerPage.locator(".guess-options button");
  const guesses = await guessButtons.allTextContents();
  const wrongGuess = guesses.find((guess) => guess.trim() !== secretWord);
  expect(wrongGuess).toBeTruthy();
  await strangerPage.getByRole("button", { name: wrongGuess!, exact: true }).click();

  for (const page of pages) {
    await expect(page.getByRole("button", { name: "오늘은 여기까지" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "오늘은 여기까지" }).click();
    await page.waitForTimeout(1_700);
  }

  await host.getByRole("button", { name: "공개 화면" }).click();
  await expect(host.getByRole("heading", { name: /승리/ })).toBeVisible({ timeout: 8_000 });
  await expect(host.getByText(`비밀 단어 · ${secretWord}`)).toBeVisible();

  await Promise.all(contexts.map((context) => context.close()));
});
