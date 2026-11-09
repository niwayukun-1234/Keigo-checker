"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  DEFAULT_OPTIONS,
  DESTINATIONS,
  LENGTHS,
  MAX_INPUT_LENGTH,
  POLITENESS,
  RELATIONS,
  TONES,
  type Candidate,
  type ConvertOptions,
  type Profile,
  STREAM_ERROR_MARK,
} from "@/lib/options";
import { addHistory, addPreset, type Contact, type Persona, type Preset } from "@/lib/db";
import { parsePartialCandidates } from "@/lib/partialJson";
import { useSpeech } from "@/lib/useSpeech";
import {
  Card,
  Chip,
  ChipRow,
  ErrorText,
  Field,
  PrimaryButton,
  SubtleButton,
  inputClass,
} from "./ui";

const LAST_OPTIONS_KEY = "keigo:lastOptions";

function loadLastOptions(): ConvertOptions {
  try {
    const raw = localStorage.getItem(LAST_OPTIONS_KEY);
    if (raw) return { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_OPTIONS;
}

const ADJUSTMENTS = [
  { label: "もう少し短く", adjust: "前回よりさらに短く、要点だけにしてください。", change: (o: ConvertOptions) => ({ ...o, length: "short" as const }) },
  { label: "もう少し丁寧に", adjust: "前回よりもう一段丁寧にしてください。", change: (o: ConvertOptions) => ({ ...o, politeness: Math.min(5, o.politeness + 1) }) },
  { label: "もう少しくだけて", adjust: "前回より少しくだけた、親しみのある言い方にしてください。", change: (o: ConvertOptions) => ({ ...o, politeness: Math.max(1, o.politeness - 1) }) },
  { label: "別の案", adjust: "前回とは違う言い回しの案を出してください。", change: (o: ConvertOptions) => o },
];

export function ConvertView({
  session,
  profile,
  personas,
  contacts,
  presets,
  onPresetsChanged,
  initial,
}: {
  session: Session;
  profile: Profile;
  personas: Persona[];
  contacts: Contact[];
  presets: Preset[];
  onPresetsChanged: () => void;
  initial?: { input: string; options: ConvertOptions; candidates: Candidate[] } | null;
}) {
  const [input, setInput] = useState(initial?.input ?? "");
  const [options, setOptions] = useState<ConvertOptions>(initial?.options ?? DEFAULT_OPTIONS);
  const [contactId, setContactId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>(initial?.candidates ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    const id = setTimeout(() => setOptions(loadLastOptions()), 0);
    return () => clearTimeout(id);
  }, [initial]);

  const appendSpeech = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev}${text}` : text));
  }, []);
  const speech = useSpeech(appendSpeech);

  const update = (patch: Partial<ConvertOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const pickRelation = (id: ConvertOptions["relation"]) => {
    const r = RELATIONS.find((x) => x.id === id)!;
    setContactId(null);
    update({ relation: id, politeness: r.defaultPoliteness, recipientName: undefined, recipientHonorific: undefined });
  };

  const pickContact = (c: Contact | null) => {
    if (!c) {
      setContactId(null);
      update({ recipientName: undefined, recipientHonorific: undefined });
      return;
    }
    setContactId(c.id);
    setPersonaId(c.persona_id && personas.some((p) => p.id === c.persona_id) ? c.persona_id : null);
    update({
      relation: c.relation,
      politeness: c.politeness,
      destination: c.destination,
      recipientName: c.name,
      recipientHonorific: c.honorific,
    });
  };

  const pickPreset = (p: Preset) => {
    setContactId(null);
    setOptions({ ...DEFAULT_OPTIONS, ...p.options, recipientName: undefined, recipientHonorific: undefined });
  };

  const run = async (opts: ConvertOptions, adjust?: string) => {
    if (!input.trim()) {
      setError("文章を入力するか、マイクで話してください");
      return;
    }
    speech.stop();
    setLoading(true);
    setError(null);
    try {
      const sender = personas.find((p) => p.id === personaId) ?? profile;
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ input, options: opts, profile: sender, adjust }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "変換に失敗しました");
      }
      setModelUsed(res.headers.get("x-keigo-model"));
      // 届いた分から順に表示する
      setCandidates([]);
      let scrolled = false;
      let buf = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const errAt = buf.indexOf(STREAM_ERROR_MARK);
        if (errAt >= 0) throw new Error(buf.slice(errAt + STREAM_ERROR_MARK.length));
        const partial = parsePartialCandidates(buf).filter((c) => c.text);
        if (partial.length > 0) {
          setCandidates(partial);
          if (!scrolled) {
            scrolled = true;
            setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          }
        }
      }
      let finalCandidates: Candidate[];
      try {
        const parsed = JSON.parse(buf) as { candidates?: Candidate[] };
        finalCandidates = (parsed.candidates ?? [])
          .filter((c) => c?.text?.trim())
          .slice(0, 3)
          .map((c) => ({ subject: c.subject?.trim() || undefined, text: c.text.trim(), note: c.note?.trim() ?? "" }));
      } catch {
        finalCandidates = parsePartialCandidates(buf).filter((c) => c.text.trim());
      }
      if (finalCandidates.length === 0) throw new Error("うまく変換できませんでした。もう一度試してください");
      setCandidates(finalCandidates);
      const data = { candidates: finalCandidates };
      try {
        localStorage.setItem(
          LAST_OPTIONS_KEY,
          JSON.stringify({ ...opts, recipientName: undefined, recipientHonorific: undefined }),
        );
      } catch {}
      addHistory(input, opts, data.candidates).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "変換に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      setError("コピーできませんでした。文章を長押ししてコピーしてください");
    }
  };

  const share = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {}
    }
  };

  const savePreset = async () => {
    const label = window.prompt("この条件の名前（例：上司にSlack）");
    if (!label?.trim()) return;
    try {
      await addPreset(label.trim(), { ...options, recipientName: undefined, recipientHonorific: undefined });
      onPresetsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
          placeholder="伝えたいことを、話し言葉のままでOK。例：明日熱あるから休みたい"
          rows={5}
          className={`${inputClass} resize-y leading-relaxed`}
        />
        {speech.interim && (
          <p className="text-sm text-zinc-400">{speech.interim}…</p>
        )}
        <div className="flex items-center gap-2">
          {speech.supported && (
            <button
              type="button"
              onClick={speech.listening ? speech.stop : speech.start}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${
                speech.listening
                  ? "animate-pulse bg-red-600 text-white"
                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              <MicIcon />
              {speech.listening ? "止める" : "話して入力"}
            </button>
          )}
          {input && (
            <SubtleButton onClick={() => setInput("")}>クリア</SubtleButton>
          )}
          <span className="ml-auto text-xs text-zinc-400">
            {input.length}/{MAX_INPUT_LENGTH}
          </span>
        </div>
        {speech.error && <ErrorText>{speech.error}</ErrorText>}
      </Card>

      {presets.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pickPreset(p)}
              className="shrink-0 rounded-full bg-amber-100 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            >
              ★ {p.label}
            </button>
          ))}
        </div>
      )}

      <Card className="space-y-4">
        {contacts.length > 0 && (
          <Field label="送る人（登録済み）">
            <select
              value={contactId ?? ""}
              onChange={(e) => pickContact(contacts.find((c) => c.id === e.target.value) ?? null)}
              className={inputClass}
            >
              <option value="">選ばない</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.honorific}（{RELATIONS.find((r) => r.id === c.relation)?.label}・丁寧{c.politeness}）
                </option>
              ))}
            </select>
          </Field>
        )}

        {personas.length > 0 && (
          <Field label="自分（どのプロフィールで送るか）">
            <ChipRow>
              <Chip active={personaId === null} onClick={() => setPersonaId(null)}>
                基本{profile.full_name ? `（${profile.full_name}）` : ""}
              </Chip>
              {personas.map((p) => (
                <Chip key={p.id} active={personaId === p.id} onClick={() => setPersonaId(p.id)}>
                  {p.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>
        )}

        <Field label="相手">
          <ChipRow>
            {RELATIONS.map((r) => (
              <Chip key={r.id} active={options.relation === r.id} onClick={() => pickRelation(r.id)}>
                {r.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={`丁寧度：${options.politeness}（${POLITENESS.find((p) => p.level === options.politeness)?.label}）`}>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={options.politeness}
            onChange={(e) => update({ politeness: Number(e.target.value) })}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-[11px] text-zinc-400">
            {POLITENESS.map((p) => (
              <span key={p.level}>{p.label}</span>
            ))}
          </div>
        </Field>

        <Field label="送り先">
          <ChipRow>
            {DESTINATIONS.map((d) => (
              <Chip key={d.id} active={options.destination === d.id} onClick={() => update({ destination: d.id })}>
                {d.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label="トーン">
          <ChipRow>
            {TONES.map((t) => (
              <Chip key={t.id} active={options.tone === t.id} onClick={() => update({ tone: t.id })}>
                {t.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <div className="flex flex-wrap items-end gap-4">
          <Field label="長さ">
            <ChipRow>
              {LENGTHS.map((l) => (
                <Chip key={l.id} active={options.length === l.id} onClick={() => update({ length: l.id })}>
                  {l.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>
          <label className="flex items-center gap-2 pb-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={options.emoji}
              onChange={(e) => update({ emoji: e.target.checked })}
              className="h-4 w-4 accent-indigo-600"
            />
            絵文字を使う
          </label>
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={savePreset} className="text-sm text-indigo-600 dark:text-indigo-400">
            ☆ この条件を保存
          </button>
        </div>
      </Card>

      <div className="sticky bottom-20 z-10">
        <PrimaryButton onClick={() => run(options)} disabled={loading} className="w-full text-lg shadow-lg">
          {loading ? (candidates.length > 0 ? "書いています…" : "変換中…") : "敬語にする"}
        </PrimaryButton>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {candidates.length > 0 && (
        <div ref={resultsRef} className="scroll-mt-4 space-y-3">
          {modelUsed && (
            <p className="text-xs text-zinc-400">
              {modelUsed.includes("lite") ? "⚡ 速さ優先で作成" : "◎ 丁寧さ優先で作成（大事な相手・メール向け）"}
            </p>
          )}
          {candidates.map((c, i) => {
            const full = c.subject ? `件名：${c.subject}\n\n${c.text}` : c.text;
            return (
              <Card key={i} className="space-y-3">
                <div className="text-xs font-semibold text-zinc-400">案 {i + 1}</div>
                {c.subject && (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 text-sm">
                      <span className="text-zinc-500">件名：</span>
                      {c.subject}
                    </div>
                    <SubtleButton onClick={() => copy(`s${i}`, c.subject!)}>
                      {copied === `s${i}` ? "コピー済" : "件名コピー"}
                    </SubtleButton>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed text-zinc-900 dark:text-zinc-100">{c.text}</p>
                {c.note && (
                  <details className="text-sm text-zinc-500">
                    <summary className="cursor-pointer select-none">どこを変えた？</summary>
                    <p className="mt-1">{c.note}</p>
                  </details>
                )}
                <div className="flex gap-2">
                  <PrimaryButton onClick={() => copy(`t${i}`, c.subject ? c.text : full)} className="flex-1 py-2.5">
                    {copied === `t${i}` ? "コピーしました ✓" : c.subject ? "本文をコピー" : "コピー"}
                  </PrimaryButton>
                  {canShare && <SubtleButton onClick={() => share(full)}>共有</SubtleButton>}
                </div>
              </Card>
            );
          })}
          <div className="flex flex-wrap gap-2">
            {ADJUSTMENTS.map((a) => (
              <SubtleButton
                key={a.label}
                disabled={loading}
                onClick={() => {
                  const next = a.change(options);
                  setOptions(next);
                  run(next, a.adjust);
                }}
              >
                {a.label}
              </SubtleButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}
