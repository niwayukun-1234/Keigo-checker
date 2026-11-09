"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, testPush } from "@/lib/push";
import { Card, ErrorText, PrimaryButton, SubtleButton } from "./ui";

type State = "loading" | "unsupported" | "needs-install" | "off" | "on";

export function NotificationSettings({ session }: { session: Session }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let next: State;
      if (isIOS() && !isStandalone()) next = "needs-install";
      else if (!pushSupported()) next = "unsupported";
      else {
        const sub = await currentSubscription().catch(() => null);
        next = sub && Notification.permission === "granted" ? "on" : "off";
      }
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const act = async (fn: () => Promise<void>, done: string, nextState?: State) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await fn();
      if (nextState) setState(nextState);
      setStatus(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "うまくいきませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">通知</h2>
      <p className="text-sm text-zinc-500">
        変換中に別のアプリに切り替えても、できあがったら通知でお知らせします。
      </p>
      {state === "needs-install" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          iPhoneでは、ホーム画面に追加したアプリから開くと通知を使えます。Safariの共有ボタン →「ホーム画面に追加」で追加して、そこから開いてください。
        </p>
      )}
      {state === "unsupported" && <p className="text-sm text-zinc-500">このブラウザでは通知を使えません。</p>}
      {state === "off" && (
        <PrimaryButton
          disabled={busy}
          className="w-full"
          onClick={() => act(() => enablePush(session.user.id), "通知をオンにしました", "on")}
        >
          通知をオンにする
        </PrimaryButton>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">オン</span>
          <SubtleButton disabled={busy} onClick={() => act(() => testPush(session), "テスト通知を送りました")}>
            テスト通知
          </SubtleButton>
          <SubtleButton disabled={busy} onClick={() => act(() => disablePush(session.user.id), "通知をオフにしました", "off")}>
            オフにする
          </SubtleButton>
        </div>
      )}
      {status && <p className="text-sm text-emerald-600">{status}</p>}
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
