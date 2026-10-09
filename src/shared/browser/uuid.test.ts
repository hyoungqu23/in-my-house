import { afterEach, expect, it, vi } from "vitest";
import { createBrowserId } from "./uuid";

afterEach(() => vi.unstubAllGlobals());
it("generates random UUID v4 action and device IDs without randomUUID", () => {
  const random = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  vi.stubGlobal("crypto", { getRandomValues: random });
  const ids = Array.from({ length: 100 }, createBrowserId);
  expect(new Set(ids).size).toBe(100);
  for (const id of ids) expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});
