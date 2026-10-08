import { expect, test } from "@playwright/test";

test("refined forest friends can be selected and every SVG paint reference resolves", async ({ page }) => {
  await page.goto("/preview/connected-forest");
  await expect(page.getByRole("button", { name: "겨울잠쥐 일러스트 선택" })).toHaveCount(0);
  for (const name of ["수달", "비버", "너구리"]) {
    const choice = page.getByRole("button", { name: `${name} 일러스트 선택`, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  const brokenPaints = await page.locator("svg").evaluateAll((svgs) => svgs.flatMap((svg) => {
    const ids = new Set(Array.from(svg.querySelectorAll("[id]"), (node) => node.id));
    return Array.from(svg.querySelectorAll("[fill], [stroke]"), (node) =>
      [node.getAttribute("fill"), node.getAttribute("stroke")].filter((paint) =>
        paint?.startsWith("url(#") && !ids.has(paint.slice(5, -1)),
      ),
    ).flat();
  }));
  expect(brokenPaints).toEqual([]);
});

test("forest SVG preview renders without hydration errors and supports keyboard placement", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/preview/connected-forest");
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
  await expect(page.getByRole("heading", { level: 1, name: /작은 숲에/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "19칸 숲 배치 미리보기" }).getByRole("button")).toHaveCount(19);
  await expect(page.getByRole("button", { name: /일러스트 선택$/ })).toHaveCount(12);
  await expect(page.getByRole("button", { name: "숲에 놓아보기" })).toBeDisabled();
  await page.getByRole("button", { name: "여우 일러스트 선택" }).click();
  await expect(page.getByRole("heading", { name: "여우", exact: true })).toHaveCount(1);
  const hex = page.getByRole("button", { name: "h08 빈칸에 놓기", exact: true });
  await hex.focus();
  await page.keyboard.press("Enter");
  await expect(hex).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "숲에 놓아보기" }).click();
  await expect(page.getByRole("button", { name: "h08 꽃", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "함께 산책하기", exact: true }).click();
  await expect(page.getByText("두 숲 사이에 작은 발자국이 이어져요.")).toBeVisible();
  await page.getByRole("button", { name: "미리보기 초기화" }).click();
  await expect(hex).toBeEnabled();
  const ids = await page.locator("svg [id]").evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(errors).toEqual([]);
});

test("forest preview fits small screens and retains touch targets with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview/connected-forest");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const undersized = await page.locator("main button:enabled").evaluateAll((nodes) => nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && (rect.width < 44 || rect.height < 44);
    }).map((node) => node.getAttribute("aria-label") || node.textContent));
    expect(undersized).toEqual([]);
  }
});
