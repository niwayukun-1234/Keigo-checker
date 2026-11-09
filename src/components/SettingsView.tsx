"use client";

import { useState } from "react";
import type { Profile } from "@/lib/options";
import { deletePersona, deletePreset, saveProfile, upsertPersona, type Persona, type Preset } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { NotificationSettings } from "./NotificationSettings";
import { Card, ErrorText, Field, PrimaryButton, SubtleButton, inputClass } from "./ui";

function ProfileFields({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  return (
    <>
      <Field label="名前">
        <input value={value.full_name} onChange={(e) => onChange({ ...value, full_name: e.target.value })} placeholder="例：山田 太郎" className={inputClass} />
      </Field>
      <Field label="所属">
        <input value={value.company} onChange={(e) => onChange({ ...value, company: e.target.value })} placeholder="例：〇〇株式会社 営業部" className={inputClass} />
      </Field>
      <Field label="肩書き">
        <input value={value.job_title} onChange={(e) => onChange({ ...value, job_title: e.target.value })} placeholder="任意" className={inputClass} />
      </Field>
      <Field label="メールの署名">
        <textarea
          value={value.signature}
          onChange={(e) => onChange({ ...value, signature: e.target.value })}
          rows={4}
          placeholder={"例：\n――――――\n山田 太郎\n〇〇株式会社\nTEL: 000-0000-0000"}
          className={inputClass}
        />
      </Field>
    </>
  );
}

type PersonaDraft = Omit<Persona, "id"> & { id?: string };
const EMPTY_PERSONA: PersonaDraft = { label: "", full_name: "", company: "", job_title: "", signature: "" };

export function SettingsView({
  session,
  userId,
  email,
  profile,
  personas,
  presets,
  onChanged,
}: {
  session: Session;
  userId: string;
  email: string;
  profile: Profile;
  personas: Persona[];
  presets: Preset[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft | null>(null);
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

  const savePersona = async () => {
    if (!personaDraft) return;
    if (!personaDraft.label.trim()) {
      setError("プロフィールの名前（例：会社用）を入れてください");
      return;
    }
    setError(null);
    try {
      await upsertPersona({ ...personaDraft, label: personaDraft.label.trim() });
      setPersonaDraft(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const removePersona = async (p: Persona) => {
    if (!window.confirm(`「${p.label}」を削除しますか？このプロフィールを使っている連絡先は「基本」に戻ります。`)) return;
    try {
      await deletePersona(p.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
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

  if (personaDraft) {
    return (
      <Card className="space-y-4">
        <h2 className="font-semibold">{personaDraft.id ? "プロフィールを編集" : "プロフィールを追加"}</h2>
        <Field label="このプロフィールの名前">
          <input
            value={personaDraft.label}
            onChange={(e) => setPersonaDraft({ ...personaDraft, label: e.target.value })}
            placeholder="例：会社用、バイト用、サークル用"
            className={inputClass}
          />
        </Field>
        <ProfileFields value={personaDraft} onChange={(p) => setPersonaDraft({ ...personaDraft, ...p })} />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <PrimaryButton onClick={savePersona} className="flex-1">
            保存
          </PrimaryButton>
          <SubtleButton onClick={() => setPersonaDraft(null)}>やめる</SubtleButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <h2 className="font-semibold">自分の情報（基本）</h2>
        <p className="text-sm text-zinc-500">メールの署名や、文中で名乗るときに使います。</p>
        <ProfileFields value={draft} onChange={setDraft} />
        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton onClick={save} className="w-full">
          {status ?? "保存"}
        </PrimaryButton>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">ほかのプロフィール</h2>
        <p className="text-sm text-zinc-500">
          相手によって名乗り方や署名を変えたいときに使います。連絡先ごとに、どのプロフィールで送るかを選べます。
        </p>
        {personas.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <div className="flex-1">
              <div className="font-medium">{p.label}</div>
              <div className="text-sm text-zinc-500">
                {[p.full_name, p.company].filter(Boolean).join("・") || "（名前未設定）"}
              </div>
            </div>
            <SubtleButton onClick={() => setPersonaDraft(p)}>編集</SubtleButton>
            <SubtleButton onClick={() => removePersona(p)}>削除</SubtleButton>
          </div>
        ))}
        <SubtleButton onClick={() => setPersonaDraft({ ...EMPTY_PERSONA, full_name: profile.full_name })} className="w-full">
          ＋ プロフィールを追加
        </SubtleButton>
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

      <NotificationSettings session={session} />

      <Card className="space-y-3">
        <div className="text-sm text-zinc-500">{email} でログイン中</div>
        <SubtleButton onClick={() => getSupabase()?.auth.signOut()}>ログアウト</SubtleButton>
      </Card>
    </div>
  );
}
