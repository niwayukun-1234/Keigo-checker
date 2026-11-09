"use client";

import type { Session } from "@supabase/supabase-js";
import type { Candidate, ConvertOptions } from "./options";
import { getSupabase } from "./supabase";

export type LastResult = {
  job: string;
  input: string;
  options: ConvertOptions;
  candidates: Candidate[];
  error: string | null;
  created_at: string;
};

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function urlB64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await registerServiceWorker();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enablePush(userId: string): Promise<void> {
  if (!pushSupported()) throw new Error("この端末・ブラウザでは通知を使えません");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("通知が許可されませんでした。iPhoneの「設定」→「通知」→「敬語チェッカー」から許可できます");
  }
  const reg = await registerServiceWorker();
  if (!reg) throw new Error("通知の準備に失敗しました");
  await navigator.serviceWorker.ready;
  const res = await fetch("/api/push/key");
  const { publicKey, error } = (await res.json()) as { publicKey?: string; error?: string };
  if (!publicKey) throw new Error(error ?? "通知の準備に失敗しました");
  // 鍵が変わっていたら作り直す
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe().catch(() => {});
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(publicKey),
  });
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase が設定されていません");
  const { error: dbError } = await sb
    .from("keigo_push")
    .upsert({ user_id: userId, subscription: sub.toJSON(), updated_at: new Date().toISOString() });
  if (dbError) throw new Error(dbError.message);
}

export async function disablePush(userId: string): Promise<void> {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe().catch(() => {});
  const sb = getSupabase();
  if (sb) await sb.from("keigo_push").update({ subscription: null }).eq("user_id", userId);
}

export async function testPush(session: Session): Promise<void> {
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "通知を送れませんでした");
  }
}

/**
 * アプリを離れた／戻ったことをサーバーに伝える。
 * 画面が隠れる瞬間でも届くように keepalive の fetch で直接送る。
 */
function writePushRow(session: Session, patch: Record<string, unknown>, onlyIfPendingJob?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const headers = {
    apikey: key,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
  };
  if (onlyIfPendingJob) {
    fetch(
      `${url}/rest/v1/keigo_push?user_id=eq.${session.user.id}&pending_job=eq.${encodeURIComponent(onlyIfPendingJob)}`,
      { method: "PATCH", headers: { ...headers, prefer: "return=minimal" }, body: JSON.stringify(patch), keepalive: true },
    ).catch(() => {});
    return;
  }
  fetch(`${url}/rest/v1/keigo_push?on_conflict=user_id`, {
    method: "POST",
    headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: session.user.id, ...patch, updated_at: new Date().toISOString() }),
    keepalive: true,
  }).catch(() => {});
}

export function markAway(session: Session, jobId: string) {
  writePushRow(session, { pending_job: jobId, away_job: jobId });
}

export function markBack(session: Session, jobId: string) {
  writePushRow(session, { pending_job: null }, jobId);
}

export async function fetchLastResult(jobId: string): Promise<LastResult | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("keigo_push").select("last_result").maybeSingle();
  const r = data?.last_result as LastResult | null | undefined;
  return r && r.job === jobId ? r : null;
}
