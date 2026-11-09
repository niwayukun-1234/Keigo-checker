import { createECDH, hkdfSync } from "node:crypto";
import { sendNotification, type PushSubscription } from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * 通知用の鍵（VAPID）。VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY があればそれを使い、
 * なければ GEMINI_API_KEY から決まった鍵を作る（設定を増やさずに済むように）。
 */
export function vapidKeys(): { publicKey: string; privateKey: string } | null {
  if (process.env.VAPID_PRIVATE_KEY && process.env.VAPID_PUBLIC_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const seed = process.env.GEMINI_API_KEY;
  if (!seed) return null;
  const priv = Buffer.from(hkdfSync("sha256", seed, "keigo-checker", "vapid-p256", 32));
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(priv) };
}

export type PushPayload = { title: string; body: string; url: string };

/** 送れなかったら false。送り先が無効になっていたら "gone"。 */
export async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
  origin: string,
): Promise<true | false | "gone"> {
  const keys = vapidKeys();
  if (!keys) return false;
  try {
    await sendNotification(subscription, JSON.stringify(payload), {
      vapidDetails: { subject: origin, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 600,
      urgency: "high",
    });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    console.error("push failed", status);
    return status === 404 || status === 410 || status === 403 ? "gone" : false;
  }
}

/** ログイン中のユーザーとして Supabase を使う（RLS がそのまま効く） */
export function supabaseAs(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function bearer(request: Request): string | null {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
}
