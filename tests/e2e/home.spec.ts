import { expect, test, type Browser } from "@playwright/test";

const circuitLabels = ["빨강 삼각형", "파랑 원", "노랑 별", "초록 사각형", "보라 달", "주황 번개"];

const permutations = <T>(values: T[]): T[][] => {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)])
      .map((rest) => [value, ...rest]),
  );
};

function solveCircuit(clues: string[]) {
  const labels = circuitLabels.filter((label) => clues.some((clue) => clue.includes(label)));
  const valid = permutations(labels).filter((order) => clues.every((clue) => {
    const mentioned = labels
      .filter((label) => clue.includes(label))
      .sort((first, second) => clue.indexOf(first) - clue.indexOf(second));
    const position = (label: string) => order.indexOf(label);
    if (clue.includes("보다 앞입니다")) return position(mentioned[0]) < position(mentioned[1]);
    if (clue.includes("서로 붙어 있습니다")) return Math.abs(position(mentioned[0]) - position(mentioned[1])) === 1;
    if (clue.includes("번째 칸입니다")) return position(mentioned[0]) === Number(clue.match(/(\d+)번째/)?.[1]) - 1;
    if (clue.includes("사이에는 모듈이")) {
      return Math.abs(position(mentioned[0]) - position(mentioned[1])) - 1 === Number(clue.match(/모듈이 (\d+)개/)?.[1]);
    }
    if (clue.includes("맨 처음 또는 맨 끝")) {
      const index = position(mentioned[0]);
      return index === 0 || index === order.length - 1;
    }
    return false;
  }));
  expect(valid).toHaveLength(1);
  return valid[0];
}

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

async function playDawnSwitchboard(browser: Browser, playerCount: 3 | 6) {
  const contexts = await Promise.all(
    Array.from({ length: playerCount }, () => browser.newContext()),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host] = pages;
  const nicknames = ["수리공 민수", "수리공 유진", "수리공 하나", "수리공 준호", "수리공 소라", "수리공 태오"]
    .slice(0, playerCount);

  await host.goto("/");
  await host.getByRole("button", { name: "배전반 복구 시작하기" }).click();
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
  await host.getByRole("button", { name: "모두 준비됨 · 배전반 열기" }).click();
  for (const page of pages) {
    const readyButton = page.getByRole("button", { name: "단서를 확인했습니다" });
    await expect(readyButton).toBeVisible({ timeout: 8_000 });
    for (let attempt = 0; attempt < 4 && await readyButton.isVisible(); attempt += 1) {
      await expect(readyButton).toBeEnabled({ timeout: 8_000 });
      await readyButton.click();
      await host.waitForTimeout(1_700);
    }
    await expect(readyButton).toBeHidden({ timeout: 8_000 });
  }

  async function ensurePrivateView(page: typeof host) {
    const controls = page.locator(".switchboard-controls");
    await page.getByRole("button", { name: "내 화면", exact: true }).click();
    await expect(controls).toBeVisible({ timeout: 8_000 });
  }

  async function activePageFor(label: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      for (const page of pages) {
        await ensurePrivateView(page);
        const button = page.locator(".switch-options button").filter({ hasText: label });
        if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
          return { page, button };
        }
      }
      await host.waitForTimeout(200);
    }
    throw new Error(`No active repairer found for ${label}`);
  }

  for (let stage = 1; stage <= 3; stage += 1) {
    await Promise.all(pages.map(ensurePrivateView));
    await Promise.all(pages.map((page) =>
      expect(page.locator(".switchboard-controls .room-code")).toHaveText(`PANEL ${stage}/3`, { timeout: 8_000 }),
    ));
    const clues = (await Promise.all(pages.map((page) =>
      page.locator(".private-clues article strong").allTextContents(),
    ))).flat();
    const solution = solveCircuit(clues);

    for (const label of solution) {
      const { button } = await activePageFor(label);
      await button.click();
    }

    if (stage < 3) {
      await expect(host.getByText("배전반 복구 성공. 다음 단서를 준비하는 중입니다.")).toBeVisible({ timeout: 8_000 });
    }
  }

  await host.getByRole("button", { name: "공개 화면" }).click();
  await expect(host.getByRole("heading", { name: "집 전체의 전력이 돌아왔습니다" })).toBeVisible({ timeout: 8_000 });
  await expect(host.getByText("공동 승리")).toBeVisible();

  await Promise.all(contexts.map((context) => context.close()));
}

test("three repairers restore all dawn switchboard panels", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "multi-context match runs once");
  test.setTimeout(120_000);
  await playDawnSwitchboard(browser, 3);
});

test("six repairers restore all dawn switchboard panels", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "multi-context match runs once");
  test.setTimeout(180_000);
  await playDawnSwitchboard(browser, 6);
});

test("two players swap roles across a midnight footprints match and start a rematch", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "multi-context match runs once");
  test.setTimeout(90_000);

  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host] = pages;

  await host.goto("/");
  await host.getByRole("button", { name: "야간 잠입 시작하기" }).click();
  await expect(host.getByRole("heading", { name: "누가 문을 두드렸나요?" })).toBeVisible();
  const links = await host.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("in-my-house:links:")
    );
    return key
      ? JSON.parse(localStorage.getItem(key)!) as { joinUrl: string; code: string }
      : undefined;
  });
  expect(links).toBeTruthy();

  for (const [index, page] of pages.entries()) {
    if (index > 0) await page.goto(links!.joinUrl);
    await page.getByLabel("닉네임").fill(index === 0 ? "달빛 괴도" : "야간 경비");
    await page.getByRole("button", { name: "이 이름으로 들어가기" }).click();
    await expect(page).toHaveURL(new RegExp(`/room/${links!.code}$`));
  }

  await expect(host.getByText("야간 경비")).toBeVisible({ timeout: 8_000 });
  await host.getByRole("button", { name: "두 사람 준비됨 · 야간 순찰 시작" }).click();

  async function ensurePrivate(page: typeof host) {
    await page.getByRole("button", { name: "내 화면", exact: true }).click();
    await expect(page.locator(".footprints-controls")).toBeVisible({ timeout: 8_000 });
  }

  async function rolePages() {
    await Promise.all(pages.map(ensurePrivate));
    const firstRole = (await pages[0].locator(".footprints-role").textContent())?.trim();
    return firstRole?.includes("괴도")
      ? { intruder: pages[0], guard: pages[1] }
      : { intruder: pages[1], guard: pages[0] };
  }

  async function getCaughtAtEntry() {
    const { intruder, guard } = await rolePages();
    const entryButtons = intruder.locator(".entry-selector button");
    await expect(entryButtons).toHaveCount(3);
    const entryName = (await entryButtons.last().textContent())!.trim();
    await entryButtons.last().click();
    await intruder.getByRole("button", { name: "역할 확인 · 준비 완료" }).click();
    await guard.waitForTimeout(1_700);
    await guard.getByRole("button", { name: "역할 확인 · 준비 완료" }).click();

    const searchSection = guard.locator(".private-choice").filter({
      has: guard.getByRole("heading", { name: "이동 후 최종 방 수색" }),
    });
    const capturePath = searchSection.getByRole("button").filter({ hasText: entryName });
    await expect(capturePath.first()).toBeVisible({ timeout: 8_000 });
    await capturePath.first().click();
    await expect(guard.getByRole("button", { name: "다음 라운드로" })).toBeVisible({
      timeout: 8_000,
    });
    await guard.getByRole("button", { name: "다음 라운드로" }).click();
    await intruder.waitForTimeout(1_700);
    await intruder.getByRole("button", { name: "다음 라운드로" }).click();
  }

  const initialRoles = await rolePages();
  await getCaughtAtEntry();
  const swappedRoles = await rolePages();
  expect(swappedRoles.intruder).toBe(initialRoles.guard);
  await getCaughtAtEntry();

  await host.getByRole("button", { name: "공개 화면" }).click();
  await expect(host.getByRole("heading", { name: "두 번의 잠입이 끝났습니다" })).toBeVisible({
    timeout: 8_000,
  });
  await expect(host.getByRole("heading", { name: "두 괴도의 전체 경로" })).toBeVisible();

  await Promise.all(pages.map(ensurePrivate));
  await pages[0].getByRole("button", { name: "한 판 더" }).click();
  await pages[1].waitForTimeout(1_700);
  await pages[1].getByRole("button", { name: "한 판 더" }).click();
  await expect(pages[0].getByText("ROUND 1/2 · PRIVATE")).toBeVisible({ timeout: 8_000 });

  await Promise.all(contexts.map((context) => context.close()));
});
