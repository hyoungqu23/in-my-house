"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserId } from "@/shared/browser/uuid";

let supabase: SupabaseClient | undefined;

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return undefined;
  supabase ??= createClient(url, anonKey);
  return supabase;
}

function getLocalDeviceId() {
  const key = "in-my-house:device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = createBrowserId();
  window.localStorage.setItem(key, id);
  return id;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    const client = getBrowserSupabase();
    if (!client) throw new Error("Supabase 클라이언트를 만들지 못했습니다.");
    let { data } = await client.auth.getSession();
    if (!data.session) {
      const result = await client.auth.signInAnonymously();
      if (result.error || !result.data.session) throw new Error("익명 인증을 시작하지 못했습니다.");
      data = { session: result.data.session };
    }
    return { Authorization: `Bearer ${data.session!.access_token}` };
  }
  return { "X-Device-Id": getLocalDeviceId() };
}
