"use client";

import { useState } from "react";
import type { Profile } from "@/lib/options";
import { deletePreset, saveProfile, type Preset } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import { Card, ErrorText, Field, PrimaryButton, SubtleButton, inputClass } from "./ui";

export function SettingsView({
  userId,
  email,
  profile,
  presets,
  onChanged,
}: {
  userId: string;
  email: string;
  profile: Profile;
  presets: Preset[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await saveProfile(draft, userId);
      setStatus("保存しました");
      setTimeout(() => setStatus(null), 1500);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const removePreset = async (p: Preset) => {
    if (!window.confirm(`「${p.label}」を削除しますか？`)) return;
    try {
      await deletePreset(p.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <h2 className="font-semibold">自分の情報</h2>
        <p className="text-sm text-zinc-500">メールの署名や、文中で名乗るときに使います。</p>
        <Field label="名前">
          <input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} placeholder="例：山田 太郎" className={inputClass} />
        </Field>
        <Field label="所属">
          <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} placeholder="例：〇〇株式会社 営業部" className={inputClass} />
        </Field>
        <Field label="肩書き">
          <input value={draft.job_title} onChange={(e) => setDraft({ ...draft, job_title: e.target.value })} placeholder="任意" className={inputClass} />
        </Field>
        <Field label="メールの署名">
          <textarea
            value={draft.signature}
            onChange={(e) => setDraft({ ...draft, signature: e.target.value })}
            rows={4}
            placeholder={"例：\n――――――\n山田 太郎\n〇〇株式会社\nTEL: 000-0000-0000"}
            className={inputClass}
          />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton onClick={save} className="w-full">
          {status ?? "保存"}
        </PrimaryButton>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">保存した条件</h2>
        {presets.length === 0 && (
          <p className="text-sm text-zinc-500">変換画面の「☆ この条件を保存」で追加できます。</p>
        )}
        {presets.map((p) => (
          <div key={p.id} className="flex items-center justify-between">
            <span>★ {p.label}</span>
            <SubtleButton onClick={() => removePreset(p)}>削除</SubtleButton>
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <div className="text-sm text-zinc-500">{email} でログイン中</div>
        <SubtleButton onClick={() => getSupabase()?.auth.signOut()}>ログアウト</SubtleButton>
      </Card>
    </div>
  );
}
