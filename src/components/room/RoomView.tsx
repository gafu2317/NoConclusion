"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { get, onValue, ref, set } from "firebase/database";
import { getClientDatabase } from "@/lib/firebase/client";
import { MEMBER_COLOR_CLASSES } from "@/lib/constants";
import { isEnterToSubmit } from "@/lib/keyboard";
import { getOrCreateMemberId, pickColorIdx } from "@/lib/member";
import type { RoomState } from "@/lib/types";

type Props = {
  roomCode: string;
};

type LoadStatus = "loading" | "ready" | "missing" | "error";

function isNestedVotes(votes: Record<string, unknown>): boolean {
  const keys = Object.keys(votes);
  if (keys.length === 0) return false;
  const first = votes[keys[0]!];
  return typeof first === "object" && first !== null && !Array.isArray(first);
}

/** 旧形式（topics / votes[topicId]）を読み取り可能にする */
function normalizeRoom(raw: unknown): RoomState {
  const r = raw as Record<string, unknown>;
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : 0;
  const members =
    r.members && typeof r.members === "object"
      ? (r.members as RoomState["members"])
      : {};

  let topicTitle = "";
  if (typeof r.topicTitle === "string") {
    topicTitle = r.topicTitle;
  } else if (r.topics && typeof r.topics === "object" && r.activeTopicId) {
    const topics = r.topics as Record<string, { title?: string }>;
    const tid = r.activeTopicId as string;
    topicTitle = topics[tid]?.title ?? "";
  }

  const votesFlat: Record<string, number> = {};
  if (r.votes && typeof r.votes === "object") {
    const v = r.votes as Record<string, unknown>;
    if (isNestedVotes(v)) {
      const tid = (r.activeTopicId as string) || Object.keys(v)[0];
      const inner = tid ? (v[tid] as Record<string, unknown> | undefined) : undefined;
      if (inner && typeof inner === "object") {
        for (const [mid, val] of Object.entries(inner)) {
          if (typeof val === "number") votesFlat[mid] = val;
        }
      }
    } else {
      for (const [mid, val] of Object.entries(v)) {
        if (typeof val === "number") votesFlat[mid] = val;
      }
    }
  }

  return {
    createdAt,
    topicTitle,
    members,
    votes: votesFlat,
  };
}

function tryGetDb() {
  try {
    return getClientDatabase();
  } catch {
    return null;
  }
}

export function RoomView({ roomCode }: Props) {
  const db = useMemo(() => tryGetDb(), []);
  const memberId = useMemo(() => getOrCreateMemberId(roomCode), [roomCode]);

  const [status, setStatus] = useState<LoadStatus>(db ? "loading" : "error");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [joinName, setJoinName] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const voteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!db) return;
    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsub = onValue(
      roomRef,
      (snap) => {
        if (!snap.exists()) {
          setStatus("missing");
          setRoom(null);
          return;
        }
        const next = normalizeRoom(snap.val());
        setRoom(next);
        setTopicDraft(next.topicTitle);
        setStatus("ready");
      },
      () => {
        setStatus("error");
      },
    );
    return () => unsub();
  }, [db, roomCode]);

  const isMember = Boolean(room?.members?.[memberId]);
  const members = room?.members ?? {};
  const voteMap = useMemo(() => room?.votes ?? {}, [room]);

  const joinRoom = useCallback(async () => {
    if (!db) return;
    const name = joinName.trim();
    if (!name) return;
    setErrorMsg(null);
    try {
      const membersSnap = await get(ref(db, `rooms/${roomCode}/members`));
      const existing = membersSnap.val() as Record<string, unknown> | null;
      const count = existing ? Object.keys(existing).length : 0;
      const colorIdx = pickColorIdx(memberId, count);
      await set(ref(db, `rooms/${roomCode}/members/${memberId}`), {
        name,
        colorIdx,
      });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "参加に失敗した");
    }
  }, [db, joinName, memberId, roomCode]);

  const commitTopicTitle = useCallback(
    (title: string) => {
      if (!db) return;
      set(ref(db, `rooms/${roomCode}/topicTitle`), title).catch((e) =>
        setErrorMsg(e instanceof Error ? e.message : "議題の保存に失敗した"),
      );
    },
    [db, roomCode],
  );

  const onTopicChange = useCallback(
    (value: string) => {
      setTopicDraft(value);
      if (topicDebounceRef.current) clearTimeout(topicDebounceRef.current);
      topicDebounceRef.current = setTimeout(() => {
        commitTopicTitle(value);
      }, 400);
    },
    [commitTopicTitle],
  );

  const writeVote = useCallback(
    (value: number) => {
      if (!db) return;
      if (voteDebounceRef.current) clearTimeout(voteDebounceRef.current);
      voteDebounceRef.current = setTimeout(() => {
        set(ref(db, `rooms/${roomCode}/votes/${memberId}`), value).catch(
          (e) => setErrorMsg(e instanceof Error ? e.message : "投票の保存に失敗した"),
        );
      }, 80);
    },
    [db, memberId, roomCode],
  );

  useEffect(() => {
    return () => {
      if (voteDebounceRef.current) clearTimeout(voteDebounceRef.current);
      if (topicDebounceRef.current) clearTimeout(topicDebounceRef.current);
    };
  }, []);

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/r/${roomCode}`;
    void navigator.clipboard.writeText(url);
  }, [roomCode]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        読み込み中…
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-lg text-zinc-200">このルームはないか、もう消えてる。</p>
        <Link
          href="/"
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          トップへ
        </Link>
      </div>
    );
  }

  if (status === "error" || !room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-zinc-400">接続に失敗した。Firebase の設定を確認して。</p>
        <Link
          href="/"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          トップへ
        </Link>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">ルーム {roomCode}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            表示名だけ入れれば参加できる
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-zinc-400">名前</label>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="例: フリーレン"
            maxLength={32}
            onKeyDown={(e) => {
              if (isEnterToSubmit(e)) void joinRoom();
            }}
          />
        </div>
        {errorMsg ? (
          <p className="text-sm text-rose-400">{errorMsg}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void joinRoom()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          参加する
        </button>
        <Link href="/" className="text-center text-sm text-zinc-500 hover:text-zinc-300">
          戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <header className="flex flex-col gap-3 border-b border-zinc-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Room</p>
          <h1 className="font-mono text-2xl font-semibold text-zinc-50">{roomCode}</h1>
          <p className="mt-1 text-xs text-zinc-600">
            作成: {new Date(room.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
          >
            リンクをコピー
          </button>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            トップ
          </Link>
        </div>
      </header>

      {errorMsg ? (
        <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {errorMsg}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-400">議題</label>
        <textarea
          className="min-h-[88px] w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500"
          value={topicDraft}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder="いま話してる議題を書く（別の話題にしたときはここを書き換える）"
          maxLength={500}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-zinc-400">参加者</h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.entries(members)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .map(([id, m]) => {
              const v = voteMap[id];
              const hasVote = typeof v === "number";
              const mine = id === memberId;
              const displayNum = typeof v === "number" ? v : mine ? 50 : null;
              const sliderValue = typeof v === "number" ? v : 50;
              const dotClass =
                MEMBER_COLOR_CLASSES[m.colorIdx % MEMBER_COLOR_CLASSES.length]!;
              return (
                <li
                  key={id}
                  className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
                      aria-hidden
                    />
                    <span className="font-medium text-zinc-100">{m.name}</span>
                    {mine ? (
                      <span className="text-xs text-sky-400">（自分）</span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-4">
                    <p
                      className={`font-mono text-5xl font-semibold tabular-nums text-zinc-50 sm:text-6xl ${
                        displayNum === null ? "text-zinc-600" : ""
                      }`}
                    >
                      {displayNum !== null ? displayNum : "—"}
                    </p>
                    {mine ? (
                      <div className="flex w-full max-w-xs flex-col items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={sliderValue}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            writeVote(n);
                          }}
                          className="w-full accent-sky-500"
                        />
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`vote-num-${memberId}`}
                            className="text-xs text-zinc-500"
                          >
                            数値
                          </label>
                          <input
                            id={`vote-num-${memberId}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            step={1}
                            value={sliderValue}
                            onChange={(e) => {
                              const t = e.target.value;
                              if (t === "" || t === "-") return;
                              const n = parseInt(t, 10);
                              if (Number.isNaN(n)) return;
                              writeVote(Math.min(100, Math.max(0, n)));
                            }}
                            className="w-20 rounded-lg border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-center font-mono text-sm text-zinc-100 tabular-nums outline-none focus:border-sky-500"
                          />
                        </div>
                      </div>
                    ) : hasVote ? null : (
                      <p className="text-xs text-zinc-600">まだ票がない</p>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
