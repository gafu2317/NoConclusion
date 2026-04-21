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

  const fieldClass =
    "min-w-0 flex-1 rounded-xl border border-zinc-200/90 bg-white/90 px-3.5 py-2.5 font-mono text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 motion-safe:duration-200 dark:border-zinc-700/90 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500";

  const panelClass =
    "rounded-2xl border border-zinc-200/80 bg-white/75 p-6 shadow-sm ring-1 ring-black/3 backdrop-blur-md motion-safe:transition-[box-shadow,border-color] motion-safe:duration-200 motion-safe:ease-out dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:ring-white/4";

  return (
    <main className="nc-view-enter mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-12 px-5 py-14 sm:px-6">
      <header className="space-y-3 text-center sm:text-left">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-500">
          Vote sync
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          NoConclusion
        </h1>
        <p className="text-pretty text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          通話しながら議題ごとの賛否を 0〜100 で揃えて見る。ログインはない。
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <section className={panelClass}>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            新しいルーム
          </h2>
          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={creating}
            className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 motion-safe:duration-200 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus-visible:outline-sky-400 motion-reduce:active:scale-100"
          >
            {creating ? "作成中…" : "ルームを作る"}
          </button>
        </section>

        <section className={panelClass}>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            コードで参加
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <input
              className={fieldClass}
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
              className="shrink-0 rounded-xl border border-zinc-200 bg-zinc-50/90 px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-safe:duration-200 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800 motion-reduce:active:scale-100"
            >
              参加
            </button>
          </div>
        </section>
      </div>

      {error ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-rose-200/80 bg-rose-50/95 px-4 py-3 text-sm text-rose-900 shadow-sm motion-safe:transition-opacity motion-safe:duration-200 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {error}
        </p>
      ) : null}
    </main>
  );
}
