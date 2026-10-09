import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("HTTP LAN clients create, join, copy an invite manually, and submit a game action", async ({ page, request, baseURL }) => {
  const origin = "http://in-my-house.test";
  await page.route(`${origin}/**`, async (route) => {
    const original = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(original.pathname + original.search, baseURL).href });
    await route.fulfill({ response });
  });
  await page.goto(origin);
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await page.getByRole("button", { name: "불을 끄고 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "누가 문을 두드렸나요?" })).toBeVisible();
  const links = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith("in-my-house:links:"))!;
    return JSON.parse(localStorage.getItem(key)!) as { code: string; joinUrl: string };
  });
  await page.getByLabel("닉네임", { exact: true }).fill("로컬 호스트");
  await page.getByRole("button", { name: "이 이름으로 들어가기" }).click();
  await page.getByRole("button", { name: "초대 링크 복사", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "직접 복사할 초대 링크" })).toHaveValue(links.joinUrl);
  for (const nickname of ["로컬 손님1", "로컬 손님2"]) {
    const joined = await request.post(`/api/rooms/${links.code}/join`, {
      headers: { "X-Device-Id": randomUUID() },
      data: { joinToken: new URL(links.joinUrl).hash.slice(1), nickname },
    });
    expect(joined.ok()).toBe(true);
  }
  await expect(page.getByText("로컬 손님2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "모두 준비됨 · 게임 시작" }).click();
  await page.getByRole("button", { name: "빈 방", exact: true }).first().click();
  await expect(page.getByText("다른 플레이어의 선택을 기다리는 중입니다.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("in-my-house:device-id")))
    .toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});
