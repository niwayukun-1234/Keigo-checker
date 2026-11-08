"use client";

import { useEffect, useState } from "react";
import { DESTINATIONS, RELATIONS, labelOf } from "@/lib/options";
import { deleteHistory, listHistory, type HistoryItem } from "@/lib/db";
import { Card, ErrorText, SubtleButton } from "./ui";

export function HistoryView({ onOpen }: { onOpen: (item: HistoryItem) => void }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listHistory()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました"));

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    try {
      await deleteHistory(id);
      setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!items) return <p className="text-sm text-zinc-500">読み込み中…</p>;
  if (items.length === 0) return <p className="text-sm text-zinc-500">まだ履歴がありません。</p>;

  return (
    <div className="space-y-3">
      {items.map((h) => (
        <Card key={h.id} className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>{new Date(h.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <span>
              {h.options.recipientName ? `${h.options.recipientName}${h.options.recipientHonorific ?? ""}・` : ""}
              {labelOf(RELATIONS, h.options.relation)}・丁寧{h.options.politeness}・{labelOf(DESTINATIONS, h.options.destination)}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-zinc-500">{h.input}</p>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm">{h.candidates[0]?.text}</p>
          <div className="flex gap-2">
            <SubtleButton onClick={() => onOpen(h)}>開く</SubtleButton>
            <SubtleButton onClick={() => remove(h.id)}>削除</SubtleButton>
          </div>
        </Card>
      ))}
    </div>
  );
}
