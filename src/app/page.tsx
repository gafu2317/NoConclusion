"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isEnterToSubmit } from "@/lib/keyboard";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/roomCode";

export default function Home() {
  const router = useRouter();
  const [joinInput, setJoinInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/room/create", { method: "POST" });
      const data = (await res.json()) as { roomCode?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "ルームを作れなかった");
        return;
      }
      if (data.roomCode) {
        router.push(`/r/${data.roomCode}`);
        return;
      }
      setError("roomCode が返ってこなかった");
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setCreating(false);
    }
  }

  function joinRoom() {
    setError(null);
    const code = normalizeRoomCode(joinInput);
    if (!isValidRoomCode(code)) {
      setError("ルームコードは英小文字と数字 8 文字だよ");
      return;
    }
    router.push(`/r/${code}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          NoConclusion
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          通話しながら議題ごとの賛否を 0〜100 で揃えて見るだけの部屋。ログインはない。
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          新しいルーム
        </h2>
        <button
          type="button"
          onClick={() => void createRoom()}
          disabled={creating}
          className="rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
        >
          {creating ? "作成中…" : "ルームを作る"}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          コードで参加
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="8 文字のコード"
            maxLength={16}
            onKeyDown={(e) => {
              if (isEnterToSubmit(e)) joinRoom();
            }}
          />
          <button
            type="button"
            onClick={joinRoom}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
          >
            参加
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
