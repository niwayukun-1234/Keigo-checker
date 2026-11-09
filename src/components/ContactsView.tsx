"use client";

import { useState } from "react";
import { DESTINATIONS, POLITENESS, RELATIONS, labelOf } from "@/lib/options";
import { deleteContact, upsertContact, upsertPersona, type Contact, type Persona } from "@/lib/db";
import { Card, Chip, ChipRow, ErrorText, Field, PrimaryButton, SubtleButton, inputClass } from "./ui";

type Draft = Omit<Contact, "id"> & { id?: string };

const EMPTY: Draft = {
  name: "",
  honorific: "さん",
  relation: "senpai",
  politeness: 3,
  destination: "line",
  persona_id: null,
};

const HONORIFICS = ["さん", "様", "先生", "先輩", "くん", "ちゃん", "（なし）"];

export function ContactsView({
  contacts,
  personas,
  onChanged,
}: {
  contacts: Contact[];
  personas: Persona[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPersona, setNewPersona] = useState<{ label: string; full_name: string; company: string } | null>(null);

  const createPersona = async () => {
    if (!draft || !newPersona) return;
    if (!newPersona.label.trim()) {
      setError("プロフィールの名前を入れてください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await upsertPersona({
        label: newPersona.label.trim(),
        full_name: newPersona.full_name.trim(),
        company: newPersona.company.trim(),
        job_title: "",
        signature: "",
      });
      setDraft({ ...draft, persona_id: id });
      setNewPersona(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!draft?.name.trim()) {
      setError("名前を入れてください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertContact({
        ...draft,
        name: draft.name.trim(),
        honorific: draft.honorific === "（なし）" ? "" : draft.honorific,
      });
      setDraft(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Contact) => {
    if (!window.confirm(`${c.name}${c.honorific} を削除しますか？`)) return;
    try {
      await deleteContact(c.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  if (draft) {
    return (
      <Card className="space-y-4">
        <h2 className="font-semibold">{draft.id ? "連絡先を編集" : "連絡先を追加"}</h2>
        <Field label="名前">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="例：田中"
            className={inputClass}
          />
        </Field>
        <Field label="敬称">
          <ChipRow>
            {HONORIFICS.map((h) => (
              <Chip
                key={h}
                active={(draft.honorific || "（なし）") === h}
                onClick={() => setDraft({ ...draft, honorific: h })}
              >
                {h}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label="関係">
          <ChipRow>
            {RELATIONS.map((r) => (
              <Chip
                key={r.id}
                active={draft.relation === r.id}
                onClick={() => setDraft({ ...draft, relation: r.id, politeness: r.defaultPoliteness })}
              >
                {r.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label={`この人に使う丁寧度：${draft.politeness}（${POLITENESS.find((p) => p.level === draft.politeness)?.label}）`}>
          <input
            type="range"
            min={1}
            max={5}
            value={draft.politeness}
            onChange={(e) => setDraft({ ...draft, politeness: Number(e.target.value) })}
            className="w-full accent-indigo-600"
          />
        </Field>
        <Field label="よく使う送り先">
          <ChipRow>
            {DESTINATIONS.map((d) => (
              <Chip key={d.id} active={draft.destination === d.id} onClick={() => setDraft({ ...draft, destination: d.id })}>
                {d.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label="この人に送るときの自分（名乗り方・署名）">
          <ChipRow>
            <Chip active={!draft.persona_id} onClick={() => setDraft({ ...draft, persona_id: null })}>
              基本
            </Chip>
            {personas.map((p) => (
              <Chip key={p.id} active={draft.persona_id === p.id} onClick={() => setDraft({ ...draft, persona_id: p.id })}>
                {p.label}
              </Chip>
            ))}
            {!newPersona && (
              <Chip active={false} onClick={() => setNewPersona({ label: "", full_name: "", company: "" })}>
                ＋ 新しく作る
              </Chip>
            )}
          </ChipRow>
          {newPersona && (
            <div className="mt-2 space-y-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
              <input
                value={newPersona.label}
                onChange={(e) => setNewPersona({ ...newPersona, label: e.target.value })}
                placeholder="プロフィールの名前（例：バイト用）"
                className={inputClass}
              />
              <input
                value={newPersona.full_name}
                onChange={(e) => setNewPersona({ ...newPersona, full_name: e.target.value })}
                placeholder="この人に名乗る名前（例：山田）"
                className={inputClass}
              />
              <input
                value={newPersona.company}
                onChange={(e) => setNewPersona({ ...newPersona, company: e.target.value })}
                placeholder="所属（例：カフェ〇〇 アルバイト）任意"
                className={inputClass}
              />
              <div className="flex gap-2">
                <PrimaryButton onClick={createPersona} disabled={saving} className="flex-1 py-2">
                  作ってこの人に使う
                </PrimaryButton>
                <SubtleButton onClick={() => setNewPersona(null)}>やめる</SubtleButton>
              </div>
              <p className="text-xs text-zinc-500">署名などの細かい設定は「設定」タブから変えられます。</p>
            </div>
          )}
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <PrimaryButton onClick={save} disabled={saving} className="flex-1">
            保存
          </PrimaryButton>
          <SubtleButton onClick={() => setDraft(null)}>やめる</SubtleButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        よく送る人を登録すると、選ぶだけでその人用の丁寧度と送り先で変換できます。
      </p>
      <PrimaryButton onClick={() => setDraft(EMPTY)} className="w-full">
        ＋ 連絡先を追加
      </PrimaryButton>
      {error && <ErrorText>{error}</ErrorText>}
      {contacts.map((c) => (
        <Card key={c.id} className="flex items-center gap-3">
          <div className="flex-1">
            <div className="font-semibold">
              {c.name}
              {c.honorific}
            </div>
            <div className="text-sm text-zinc-500">
              {labelOf(RELATIONS, c.relation)}・丁寧{c.politeness}・{labelOf(DESTINATIONS, c.destination)}
              {c.persona_id && personas.find((p) => p.id === c.persona_id)
                ? `・${personas.find((p) => p.id === c.persona_id)!.label}`
                : ""}
            </div>
          </div>
          <SubtleButton onClick={() => setDraft({ ...c, honorific: c.honorific || "（なし）" })}>編集</SubtleButton>
          <SubtleButton onClick={() => remove(c)}>削除</SubtleButton>
        </Card>
      ))}
    </div>
  );
}
