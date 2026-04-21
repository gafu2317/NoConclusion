"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  get,
  onValue,
  ref,
  remove,
  set,
  update,
} from "firebase/database";
import { getClientDatabase } from "@/lib/firebase/client";
import { aggregateVotes } from "@/lib/aggregate";
import {
  MEMBER_COLOR_CLASSES,
  VOTE_BUCKETS,
} from "@/lib/constants";
import { getOrCreateMemberId, pickColorIdx } from "@/lib/member";
import type { RoomState, TopicRecord } from "@/lib/types";

type Props = {
  roomCode: string;
};

type LoadStatus = "loading" | "ready" | "missing" | "error";

function normalizeRoom(raw: unknown): RoomState {
  const r = raw as Partial<RoomState>;
  return {
    createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
    activeTopicId:
      r.activeTopicId === null || typeof r.activeTopicId === "string"
        ? r.activeTopicId ?? null
        : null,
    topics: r.topics && typeof r.topics === "object" ? r.topics : {},
    members: r.members && typeof r.members === "object" ? r.members : {},
    votes: r.votes && typeof r.votes === "object" ? r.votes : {},
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
        setRoom(normalizeRoom(snap.val()));
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
  const topics = useMemo(() => room?.topics ?? {}, [room]);
  const activeTopicId = room?.activeTopicId ?? null;

  const sortedTopics = useMemo(() => {
    return Object.entries(topics)
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => a.order - b.order);
  }, [topics]);

  const voteMap = useMemo(() => {
    if (!activeTopicId || !room?.votes?.[activeTopicId]) return {};
    return room.votes[activeTopicId]!;
  }, [room, activeTopicId]);

  const { average, counts } = useMemo(() => {
    const vals = Object.values(voteMap).filter(
      (n): n is number => typeof n === "number",
    );
    return aggregateVotes(vals);
  }, [voteMap]);

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

  const addTopic = useCallback(async () => {
    if (!db) return;
    const title = topicDraft.trim();
    if (!title) return;
    setErrorMsg(null);
    const id = crypto.randomUUID();
    const order =
      sortedTopics.length === 0
        ? 0
        : Math.max(...sortedTopics.map((t) => t.order)) + 1;
    const topic: TopicRecord = { title, order };
    const updates: Record<string, unknown> = {
      [`topics/${id}`]: topic,
    };
    if (!activeTopicId) {
      updates.activeTopicId = id;
    }
    try {
      await update(ref(db, `rooms/${roomCode}`), updates);
      setTopicDraft("");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "議題の追加に失敗した");
    }
  }, [activeTopicId, db, roomCode, sortedTopics, topicDraft]);

  const setActiveTopic = useCallback(
    async (id: string) => {
      if (!db) return;
      setErrorMsg(null);
      try {
        await set(ref(db, `rooms/${roomCode}/activeTopicId`), id);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "切り替えに失敗した");
      }
    },
    [db, roomCode],
  );

  const deleteTopic = useCallback(
    async (id: string) => {
      if (!db) return;
      setErrorMsg(null);
      try {
        const nextTopics = { ...topics };
        delete nextTopics[id];
        const remaining = Object.entries(nextTopics)
          .map(([tid, t]) => ({ id: tid, ...t }))
          .sort((a, b) => a.order - b.order);

        let nextActive = activeTopicId;
        if (activeTopicId === id) {
          nextActive = remaining[0]?.id ?? null;
        }

        await remove(ref(db, `rooms/${roomCode}/topics/${id}`));
        await remove(ref(db, `rooms/${roomCode}/votes/${id}`));
        await set(ref(db, `rooms/${roomCode}/activeTopicId`), nextActive);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "削除に失敗した");
      }
    },
    [activeTopicId, db, roomCode, topics],
  );

  const writeVote = useCallback(
    (value: number) => {
      if (!db || !activeTopicId) return;
      if (voteDebounceRef.current) clearTimeout(voteDebounceRef.current);
      voteDebounceRef.current = setTimeout(() => {
        set(ref(db, `rooms/${roomCode}/votes/${activeTopicId}/${memberId}`), value).catch(
          (e) => setErrorMsg(e instanceof Error ? e.message : "投票の保存に失敗した"),
        );
      }, 80);
    },
    [activeTopicId, db, memberId, roomCode],
  );

  useEffect(() => {
    return () => {
      if (voteDebounceRef.current) clearTimeout(voteDebounceRef.current);
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
            onKeyDown={(e) => e.key === "Enter" && void joinRoom()}
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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-400">議題</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            placeholder="新しい議題"
            maxLength={200}
            onKeyDown={(e) => e.key === "Enter" && void addTopic()}
          />
          <button
            type="button"
            onClick={() => void addTopic()}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
          >
            追加
          </button>
        </div>
        {sortedTopics.length === 0 ? (
          <p className="text-sm text-zinc-500">議題がまだない</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedTopics.map((t) => {
              const active = t.id === activeTopicId;
              return (
                <li
                  key={t.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                    active
                      ? "border-sky-600/80 bg-sky-950/40"
                      : "border-zinc-800 bg-zinc-950/50"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-zinc-100 hover:text-white"
                    onClick={() => void setActiveTopic(t.id)}
                  >
                    {t.title}
                    {active ? (
                      <span className="ml-2 text-xs text-sky-400">（表示中）</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-rose-400 hover:text-rose-300"
                    onClick={() => void deleteTopic(t.id)}
                  >
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h2 className="text-sm font-medium text-zinc-400">集計（表示中の議題）</h2>
        {!activeTopicId ? (
          <p className="text-sm text-zinc-500">議題を選ぶか追加して</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-zinc-900/80 p-3">
                <p className="text-xs text-zinc-500">平均</p>
                <p className="text-2xl font-semibold text-zinc-50">
                  {average !== null ? average : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-900/80 p-3">
                <p className="text-xs text-zinc-500">
                  反対（0〜{VOTE_BUCKETS.opposeMax}）
                </p>
                <p className="text-2xl font-semibold text-rose-300">{counts.oppose}</p>
              </div>
              <div className="rounded-lg bg-zinc-900/80 p-3">
                <p className="text-xs text-zinc-500">
                  中立（{VOTE_BUCKETS.neutralMin}〜{VOTE_BUCKETS.neutralMax}）
                </p>
                <p className="text-2xl font-semibold text-amber-200">{counts.neutral}</p>
              </div>
            </div>
            <div className="rounded-lg bg-zinc-900/80 p-3">
              <p className="text-xs text-zinc-500">
                賛成（{VOTE_BUCKETS.favorMin}〜100）
              </p>
              <p className="text-2xl font-semibold text-emerald-300">{counts.favor}</p>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-zinc-400">賛否（0〜100）</h2>
        {!activeTopicId ? (
          <p className="text-sm text-zinc-500">議題を選んでからスライダーを動かして</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {Object.entries(members)
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([id, m]) => {
                const v = voteMap[id];
                const hasVote = typeof v === "number";
                const mine = id === memberId;
                const sliderValue = typeof v === "number" ? v : 50;
                const dotClass =
                  MEMBER_COLOR_CLASSES[m.colorIdx % MEMBER_COLOR_CLASSES.length]!;
                return (
                  <li key={id} className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
                        aria-hidden
                      />
                      <span className="font-medium text-zinc-100">{m.name}</span>
                      {mine ? (
                        <span className="text-xs text-sky-400">（自分）</span>
                      ) : null}
                      <span className="ml-auto font-mono text-sm text-zinc-400">
                        {hasVote || mine ? sliderValue : "—"}
                      </span>
                    </div>
                    {mine || hasVote ? (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={sliderValue}
                        disabled={!mine}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!mine) return;
                          writeVote(n);
                        }}
                        className="w-full accent-sky-500 disabled:opacity-70"
                      />
                    ) : (
                      <p className="text-xs text-zinc-600">まだ票がない</p>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
