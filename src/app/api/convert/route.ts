import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { after } from "next/server";
import type { PushSubscription } from "web-push";
import { sendPush, supabaseAs } from "@/lib/push-server";
import { IDLE_TIMEOUT_MS, TOTAL_TIMEOUT_MS, planAttempts } from "@/lib/model";
import { SLOW_MESSAGE, STALLED_MESSAGE, streamWithFallback, type StreamResult } from "@/lib/generate";
import { createClient } from "@supabase/supabase-js";
import {
  DESTINATIONS,
  LENGTHS,
  MAX_IMAGE_BASE64_LENGTH,
  MAX_INPUT_LENGTH,
  STREAM_ERROR_MARK,
  RELATIONS,
  TONES,
  type ConvertRequest,
} from "@/lib/options";
import { buildUserPrompt, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "@/lib/prompt";

// モデルの切り替えと生成にかかる時間の上限（秒）。既定の上限で途中で切られないように明示する
export const maxDuration = 60;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

async function authorize(request: Request): Promise<string | { token: string }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "ログインしてください";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "サーバーの設定（Supabase）が足りません";
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error: err } = await supabase.auth.getUser(token);
  if (err || !data.user) return "ログインの有効期限が切れました。もう一度ログインしてください";
  const allowed = process.env.ALLOWED_EMAIL?.toLowerCase().trim();
  if (allowed && data.user.email?.toLowerCase() !== allowed) {
    return "このアカウントでは使えません";
  }
  return { token };
}

function validate(body: unknown): ConvertRequest | string {
  const b = body as ConvertRequest;
  if (!b || typeof b.input !== "string") return "文章を入力してください";
  if (b.image) {
    const img = b.image;
    if (typeof img.data !== "string" || !/^image\/(jpeg|png|webp|heic|heif)$/.test(img.mimeType)) {
      return "画像の形式に対応していません";
    }
    if (img.data.length > MAX_IMAGE_BASE64_LENGTH) return "画像が大きすぎます";
  } else if (!b.input.trim()) {
    return "文章を入力してください";
  }
  if (b.input.length > MAX_INPUT_LENGTH) return `文章は${MAX_INPUT_LENGTH}文字以内にしてください`;
  const o = b.options;
  if (!o) return "条件が指定されていません";
  if (!RELATIONS.some((r) => r.id === o.relation)) return "相手の指定が不正です";
  if (!LENGTHS.some((r) => r.id === o.length)) return "長さの指定が不正です";
  if (!TONES.some((r) => r.id === o.tone)) return "トーンの指定が不正です";
  if (!DESTINATIONS.some((r) => r.id === o.destination)) return "送り先の指定が不正です";
  if (!Number.isInteger(o.politeness) || o.politeness < 1 || o.politeness > 5) {
    return "丁寧度の指定が不正です";
  }
  if (b.jobId !== undefined && (typeof b.jobId !== "string" || !/^[\w-]{8,64}$/.test(b.jobId))) {
    return "リクエストの形式が正しくありません";
  }
  if (b.adjust && (typeof b.adjust !== "string" || b.adjust.length > 200)) {
    return "追加の指示が長すぎます";
  }
  return b;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return "無料枠の上限に達しました。少し時間をおいてから試してください";
  }
  if (msg === SLOW_MESSAGE || msg === STALLED_MESSAGE || /503|UNAVAILABLE|overloaded/i.test(msg)) {
    console.error("convert slow or unavailable", msg);
    return "AIが混み合っていて時間内に作れませんでした。もう一度試してください";
  }
  console.error("convert failed", msg);
  return "AIへの接続に失敗しました。もう一度試してください";
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return error(500, "サーバーの設定（GEMINI_API_KEY）が足りません");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "リクエストの形式が正しくありません");
  }
  const req = validate(body);
  if (typeof req === "string") return error(400, req);

  // ログイン確認とAIへの依頼を同時に始めて、待ち時間を減らす
  const ai = new GoogleGenAI({ apiKey });
  const authPromise = authorize(request);
  const userPrompt = buildUserPrompt(req);
  const contents = req.image
    ? [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: req.image.mimeType, data: req.image.data } },
            { text: userPrompt },
          ],
        },
      ]
    : userPrompt;
  // 1つ目のモデルが遅い・混雑しているときは、待ち続けずにもう一方のモデルで作り直す
  const streamPromise = streamWithFallback(
    planAttempts(req.options),
    (attempt, signal) =>
      ai.models.generateContentStream({
        model: attempt.model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0.8,
          // 考える量を最小にして速くする
          thinkingConfig: { thinkingLevel: attempt.thinkingLevel as ThinkingLevel },
          abortSignal: signal,
        },
      }),
    { idleTimeoutMs: IDLE_TIMEOUT_MS, totalTimeoutMs: TOTAL_TIMEOUT_MS },
  );
  // 認証で弾く場合に未処理の拒否にならないようにする
  streamPromise.catch(() => {});

  const auth = await authPromise;
  if (typeof auth === "string") return error(401, auth);

  let stream: StreamResult;
  try {
    stream = await streamPromise;
  } catch (e) {
    const msg = friendlyError(e);
    return error(/上限/.test(msg) ? 429 : 502, msg);
  }

  // 画面に流しつつ、全文も貯めておく（アプリを離れていたら、終わったときに通知するため）
  const encoder = new TextEncoder();
  const ref: { controller: ReadableStreamDefaultController<Uint8Array> | null } = { controller: null };
  let clientGone = false;
  const send = (t: string) => {
    if (clientGone || !ref.controller) return;
    try {
      ref.controller.enqueue(encoder.encode(t));
    } catch {
      clientGone = true;
    }
  };
  const body2 = new ReadableStream<Uint8Array>({
    start(c) {
      ref.controller = c;
    },
    cancel() {
      clientGone = true;
    },
  });
  const finished = (async () => {
    let full = "";
    let failed: string | null = null;
    try {
      for await (const t of stream.chunks) {
        full += t;
        send(t);
      }
    } catch (e) {
      failed = friendlyError(e);
      send(STREAM_ERROR_MARK + failed);
    } finally {
      if (!clientGone) {
        try {
          ref.controller?.close();
        } catch {}
      }
    }
    return { full, failed };
  })();

  if (req.jobId) {
    const jobId = req.jobId;
    const origin = new URL(request.url).origin;
    after(async () => {
      const { full, failed } = await finished;
      await notifyIfAway(auth.token, jobId, req, full, failed, origin);
    });
  }

  return new Response(body2, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-keigo-model": stream.model,
    },
  });
}

/** 変換中にアプリを離れていたら、結果を保存して通知を送る */
async function notifyIfAway(
  token: string,
  jobId: string,
  req: ConvertRequest,
  full: string,
  failed: string | null,
  origin: string,
) {
  const sb = supabaseAs(token);
  if (!sb) return;
  const { data: row } = await sb
    .from("keigo_push")
    .select("user_id, subscription, pending_job, away_job")
    .maybeSingle();
  if (!row || row.away_job !== jobId) return;

  let candidates: { subject?: string; text: string; note?: string }[] = [];
  try {
    const parsed = JSON.parse(full) as { candidates?: typeof candidates };
    candidates = (parsed.candidates ?? []).filter((c) => c?.text?.trim());
  } catch {}

  const wantsPush = row.pending_job === jobId && row.subscription;
  await sb
    .from("keigo_push")
    .update({
      last_result: {
        job: jobId,
        input: req.image ? `［写真あり］${req.input}` : req.input,
        options: req.options,
        candidates,
        error: candidates.length ? null : (failed ?? "うまく変換できませんでした"),
        created_at: new Date().toISOString(),
      },
      pending_job: wantsPush ? null : row.pending_job,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", row.user_id);

  if (!wantsPush) return;
  const first = candidates[0]?.text.replace(/\s+/g, " ").trim();
  const result = await sendPush(
    row.subscription as PushSubscription,
    first
      ? { title: "敬語ができました", body: first.length > 90 ? `${first.slice(0, 90)}…` : first, url: `/?job=${jobId}` }
      : { title: "変換できませんでした", body: failed ?? "もう一度試してください", url: "/" },
    origin,
  );
  if (result === "gone") {
    await sb.from("keigo_push").update({ subscription: null }).eq("user_id", row.user_id);
  }
}
