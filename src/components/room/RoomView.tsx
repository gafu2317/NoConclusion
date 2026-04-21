"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
} from "firebase/database";
import type { OnDisconnect } from "firebase/database";
import { getClientDatabase } from "@/lib/firebase/client";
import { MEMBER_COLOR_CLASSES } from "@/lib/constants";
import { isEnterToSubmit } from "@/lib/keyboard";
import { clearMemberId, getOrCreateMemberId, pickColorIdx } from "@/lib/member";
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

const PANEL_BLUR =
  "shadow-sm ring-1 ring-black/3 backdrop-blur-md motion-safe:transition-[box-shadow,border-color] motion-safe:duration-200 motion-safe:ease-out dark:ring-white/4";

function postVacuum(roomCode: string) {
  void fetch("/api/room/vacuum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode }),
  });
}

export function RoomView({ roomCode }: Props) {
  const router = useRouter();
  const db = useMemo(() => tryGetDb(), []);
  const [memberId, setMemberId] = useState<string | null>(null);

  // localStorage は SSR に無いのでマウント後だけ ID を確定する（useSyncExternalStore だと getServerSnapshot と初回 getSnapshot の一致が難しい）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional hydration after mount
    setMemberId(getOrCreateMemberId(roomCode));
  }, [roomCode]);

  const [status, setStatus] = useState<LoadStatus>(db ? "loading" : "error");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [joinName, setJoinName] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copyAck, setCopyAck] = useState(false);

  const voteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDisconnectHandlesRef = useRef<{
    member: OnDisconnect;
    vote: OnDisconnect;
  } | null>(null);

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

  const isMember = Boolean(
    memberId && room?.members && room.members[memberId],
  );
  const members = room?.members ?? {};
  const voteMap = useMemo(() => room?.votes ?? {}, [room]);

  useEffect(() => {
    if (!db || !isMember || !memberId) return;
    const mRef = ref(db, `rooms/${roomCode}/members/${memberId}`);
    const vRef = ref(db, `rooms/${roomCode}/votes/${memberId}`);
    const odM = onDisconnect(mRef);
    const odV = onDisconnect(vRef);
    void odM.remove();
    void odV.remove();
    onDisconnectHandlesRef.current = { member: odM, vote: odV };
    return () => {
      void odM.cancel().catch(() => {});
      void odV.cancel().catch(() => {});
      onDisconnectHandlesRef.current = null;
    };
  }, [db, isMember, roomCode, memberId]);

  const joinRoom = useCallback(async () => {
    if (!db || !memberId) return;
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
      if (!db || !memberId) return;
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
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/r/${roomCode}`;
    void navigator.clipboard.writeText(url);
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    setCopyAck(true);
    copyResetRef.current = setTimeout(() => {
      setCopyAck(false);
      copyResetRef.current = null;
    }, 2000);
  }, [roomCode]);

  const leaveRoom = useCallback(async () => {
    if (!db || !memberId) return;
    setErrorMsg(null);
    const od = onDisconnectHandlesRef.current;
    if (od) {
      try {
        await od.member.cancel();
        await od.vote.cancel();
      } catch {
        /* ignore */
      }
    }
    try {
      await remove(ref(db, `rooms/${roomCode}/members/${memberId}`));
      await remove(ref(db, `rooms/${roomCode}/votes/${memberId}`));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "退室に失敗した");
      return;
    }
    clearMemberId(roomCode);
    postVacuum(roomCode);
    router.push("/");
  }, [db, memberId, roomCode, router]);

  const kickMember = useCallback(
    async (targetId: string) => {
      if (!db || !memberId || targetId === memberId) return;
      setErrorMsg(null);
      try {
        await remove(ref(db, `rooms/${roomCode}/votes/${targetId}`));
        await remove(ref(db, `rooms/${roomCode}/members/${targetId}`));
        postVacuum(roomCode);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "キックに失敗した");
      }
    },
    [db, memberId, roomCode],
  );

  const loadingBlock = (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10">
      <span
        className="h-9 w-9 motion-safe:animate-spin rounded-full border-2 border-zinc-200 border-t-sky-600 dark:border-zinc-700 dark:border-t-sky-400"
        aria-hidden
      />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中…</p>
    </div>
  );

  if (memberId === null) {
    return loadingBlock;
  }

  if (status === "loading") {
    return loadingBlock;
  }

  if (status === "missing") {
    return (
      <div className="nc-view-enter mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-14">
        <div
          className={`rounded-2xl border border-zinc-200/80 bg-white/75 p-8 text-center dark:border-zinc-800/80 dark:bg-zinc-900/50 ${PANEL_BLUR}`}
        >
          <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
            このルームはないか、もう消えてる。
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.99] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            トップへ
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error" || !room) {
    return (
      <div className="nc-view-enter mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-14">
        <div
          className={`rounded-2xl border border-zinc-200/80 bg-white/75 p-8 text-center dark:border-zinc-800/80 dark:bg-zinc-900/50 ${PANEL_BLUR}`}
        >
          <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            接続に失敗した。Firebase の設定を確認して。
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl border border-zinc-200 bg-zinc-50/90 px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-white active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            トップへ
          </Link>
        </div>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="nc-view-enter mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-14">
        <header className="text-center sm:text-left">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            Join
          </p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {roomCode}
          </h1>
          <p className="mt-2 text-[15px] text-zinc-600 dark:text-zinc-400">
            表示名だけ入れれば参加できる
          </p>
        </header>

        <div
          className={`rounded-2xl border border-zinc-200/80 bg-white/75 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/50 ${PANEL_BLUR}`}
        >
          <div className="flex flex-col gap-2">
            <label
              htmlFor="join-name"
              className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              名前
            </label>
            <input
              id="join-name"
              className="rounded-xl border border-zinc-200/90 bg-white/90 px-3.5 py-2.5 text-zinc-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700/90 dark:bg-zinc-900/80 dark:text-zinc-100 dark:focus:border-sky-500"
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
            <p
              role="alert"
              aria-live="assertive"
              className="mt-4 text-sm text-rose-700 dark:text-rose-400"
            >
              {errorMsg}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void joinRoom()}
            className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 motion-safe:duration-200 active:scale-[0.99] dark:bg-sky-500 dark:hover:bg-sky-400 motion-reduce:active:scale-100"
          >
            参加する
          </button>
        </div>

        <Link
          href="/"
          className="text-center text-sm font-medium text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          トップに戻る
        </Link>
      </div>
    );
  }

  return (
    <main className="nc-view-enter mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10">
      <header
        className={`rounded-2xl border border-zinc-200/80 bg-white/70 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/45 sm:flex sm:items-start sm:justify-between sm:gap-6 sm:p-6 ${PANEL_BLUR}`}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
            Room
          </p>
          <h1 className="mt-1 break-all font-mono text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[1.65rem]">
            {roomCode}
          </h1>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            作成 {new Date(room.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
          <button
            type="button"
            onClick={copyLink}
            aria-label="ルームの URL をクリップボードにコピー"
            className="min-w-42 rounded-xl border border-zinc-200 bg-zinc-50/90 px-3.5 py-2 text-center text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-white motion-safe:duration-200 active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200 dark:hover:bg-zinc-800 motion-reduce:active:scale-100"
          >
            {copyAck ? "コピーした" : "リンクをコピー"}
          </button>
          <button
            type="button"
            onClick={() => void leaveRoom()}
            className="rounded-xl border border-rose-200/90 bg-rose-50/95 px-3.5 py-2 text-sm font-medium text-rose-900 shadow-sm transition hover:bg-rose-100/90 motion-safe:duration-200 active:scale-[0.99] dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60 motion-reduce:active:scale-100"
          >
            ルームを抜ける
          </button>
          <Link
            href="/"
            className="rounded-xl border border-zinc-200/80 px-3.5 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 motion-safe:duration-200 active:scale-[0.99] dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 motion-reduce:active:scale-100"
          >
            トップ
          </Link>
        </div>
      </header>

      {errorMsg ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-rose-200/80 bg-rose-50/95 px-4 py-3 text-sm text-rose-900 shadow-sm motion-safe:transition-opacity motion-safe:duration-200 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {errorMsg}
        </p>
      ) : null}

      <section
        className={`rounded-2xl border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/45 sm:p-5 ${PANEL_BLUR}`}
      >
        <label
          htmlFor="room-topic"
          className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          議題
        </label>
        <textarea
          id="room-topic"
          className="mt-2 min-h-17 w-full resize-y rounded-lg border border-zinc-200/90 bg-white/90 px-3 py-2 text-sm leading-snug text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700/90 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500"
          value={topicDraft}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder="いま話してる議題を書く（別の話題にしたときはここを書き換える）"
          maxLength={500}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          参加者
        </h2>
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
                  className={`flex flex-col rounded-2xl border border-zinc-200/80 bg-linear-to-b from-white/90 to-zinc-50/80 p-5 backdrop-blur-sm hover:shadow-md motion-safe:transition-[box-shadow,transform] motion-safe:duration-200 dark:border-zinc-800/80 dark:from-zinc-900/70 dark:to-zinc-950/70 ${PANEL_BLUR}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900 ${dotClass}`}
                        aria-hidden
                      />
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {m.name}
                      </span>
                      {mine ? (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950/80 dark:text-sky-300">
                          自分
                        </span>
                      ) : null}
                    </div>
                    {!mine ? (
                      <button
                        type="button"
                        onClick={() => void kickMember(id)}
                        className="shrink-0 rounded-lg border border-zinc-200/90 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      >
                        キック
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-5">
                    <p
                      className={`font-mono text-5xl font-semibold tabular-nums tracking-tight motion-safe:transition-colors motion-safe:duration-150 sm:text-6xl ${
                        displayNum === null
                          ? "text-zinc-400 dark:text-zinc-600"
                          : "text-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      {displayNum !== null ? displayNum : "—"}
                    </p>
                    {mine ? (
                      <div className="flex w-full max-w-xs flex-col items-center gap-4">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={sliderValue}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            writeVote(n);
                          }}
                          className="w-full"
                        />
                        <div className="flex items-center gap-2.5">
                          <label
                            htmlFor={`vote-num-${memberId}`}
                            className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500"
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
                            className="w-18 rounded-xl border border-zinc-200/90 bg-white/90 px-2 py-1.5 text-center font-mono text-sm text-zinc-900 tabular-nums shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:focus:border-sky-500"
                          />
                        </div>
                      </div>
                    ) : hasVote ? null : (
                      <p className="text-xs text-zinc-500 dark:text-zinc-600">
                        まだ票がない
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </section>
    </main>
  );
}
