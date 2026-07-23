import "server-only";

import { createClient } from "@supabase/supabase-js";
import { DomainError } from "@/shared/errors/domain-error";

export type Actor = { userId: string; accessToken?: string };

export async function requireActor(request: Request): Promise<Actor> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const accessToken = authorization.slice("Bearer ".length);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new DomainError("AUTH_NOT_CONFIGURED", "Supabase 인증 설정이 없습니다.");
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) throw new DomainError("UNAUTHORIZED", "인증이 만료되었습니다.");
    return { userId: data.user.id, accessToken };
  }

  const localDeviceId = request.headers.get("x-device-id");
  const memoryMode = (process.env.GAME_STORE ?? "memory") === "memory";
  if (memoryMode && localDeviceId && /^[a-zA-Z0-9-]{16,80}$/.test(localDeviceId)) {
    return { userId: `local:${localDeviceId}` };
  }

  throw new DomainError("UNAUTHORIZED", "기기 인증이 필요합니다.");
}
