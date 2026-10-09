"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { roomApiFetch } from "@/modules/room/client/room-api";
import { UsersRound } from "@/shared/ui/icons";

export function JoinRoomForm({ code }: { code: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storageKey = `in-my-house:join:${code}`;
    const fragment = window.location.hash.slice(1);
    if (fragment) window.sessionStorage.setItem(storageKey, fragment);
    const restored = fragment || window.sessionStorage.getItem(storageKey) || "";
    queueMicrotask(() => setToken(restored));
    window.history.replaceState(null, "", window.location.pathname);
  }, [code]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await roomApiFetch(`/api/rooms/${code}/join`, {
        method: "POST",
        body: JSON.stringify({ joinToken: token, nickname }),
      });
      window.sessionStorage.removeItem(`in-my-house:join:${code}`);
      router.replace(`/room/${code}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "참가하지 못했습니다.");
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <form className="join-form" onSubmit={submit}>
      <div className="eyebrow"><span /> INVITATION · {code}</div>
      <h1>누가 문을 두드렸나요?</h1>
      <p>다른 사람의 화면에 표시될 이름을 정해 주세요.</p>
      <label htmlFor="nickname">닉네임</label>
      <input
        ref={inputRef}
        id="nickname"
        name="nickname"
        value={nickname}
        disabled={!token || loading}
        onChange={(event) => setNickname(event.target.value)}
        minLength={2}
        maxLength={16}
        autoComplete="nickname"
        placeholder="예: 겁없는 민수"
        required
        aria-describedby="nickname-help nickname-error"
      />
      <span id="nickname-help" className="field-help">2–16자 · 방 안에서 중복 불가</span>
      {error && <p id="nickname-error" className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={loading || !token || nickname.trim().length < 2}>
        <UsersRound size={20} aria-hidden="true" />
        {loading ? "문을 여는 중…" : "이 이름으로 들어가기"}
      </button>
      {!token && <p className="form-error" role="alert">초대 토큰이 없습니다. 호스트에게 새 링크를 요청해 주세요.</p>}
    </form>
  );
}
