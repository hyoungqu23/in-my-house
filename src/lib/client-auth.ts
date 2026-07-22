"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
  const id = crypto.randomUUID();
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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const auth = await getAuthHeaders();
  Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}
