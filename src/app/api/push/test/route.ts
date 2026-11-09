import type { PushSubscription } from "web-push";
import { bearer, sendPush, supabaseAs } from "@/lib/push-server";

// 設定画面の「テスト通知」用
export async function POST(request: Request) {
  const token = bearer(request);
  const sb = token ? supabaseAs(token) : null;
  if (!sb) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const { data, error } = await sb.from("keigo_push").select("subscription").maybeSingle();
  if (error) return Response.json({ error: "通知の設定を読めませんでした" }, { status: 500 });
  const sub = data?.subscription as PushSubscription | null | undefined;
  if (!sub) return Response.json({ error: "通知がオンになっていません" }, { status: 400 });
  const result = await sendPush(
    sub,
    { title: "敬語チェッカー", body: "通知のテストです。変換が終わるとこんなふうにお知らせします。", url: "/" },
    new URL(request.url).origin,
  );
  if (result === true) return Response.json({ ok: true });
  if (result === "gone") await sb.from("keigo_push").update({ subscription: null }).not("user_id", "is", null);
  return Response.json({ error: "通知を送れませんでした。通知をいったんオフにして、もう一度オンにしてください" }, { status: 502 });
}
