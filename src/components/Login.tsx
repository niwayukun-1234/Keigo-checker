"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { Card, ErrorText, Field, PrimaryButton, inputClass } from "./ui";

export function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { data, error: err } =
      mode === "signin"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("Invalid login credentials")
          ? "メールアドレスかパスワードが違います"
          : err.message,
      );
      return;
    }
    if (mode === "signup" && !data.session) {
      setInfo("確認メールを送りました。メールのリンクを開いてから、ログインしてください。");
      setMode("signin");
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold">敬語チェッカー</h1>
      <p className="mb-6 text-sm text-zinc-500">話した言葉を、相手に合った敬語に。</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="メールアドレス">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="パスワード（6文字以上）">
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}
          <PrimaryButton type="submit" disabled={busy} className="w-full">
            {mode === "signin" ? "ログイン" : "アカウントを作る"}
          </PrimaryButton>
        </form>
      </Card>
      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-4 text-sm text-indigo-600 dark:text-indigo-400"
      >
        {mode === "signin" ? "はじめての方：アカウントを作る" : "ログインに戻る"}
      </button>
    </div>
  );
}
