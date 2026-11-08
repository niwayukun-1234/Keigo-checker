import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  DESTINATIONS,
  LENGTHS,
  MAX_INPUT_LENGTH,
  RELATIONS,
  TONES,
  type Candidate,
  type ConvertRequest,
} from "@/lib/options";
import { buildUserPrompt, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "@/lib/prompt";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

async function authorize(request: Request): Promise<string | null> {
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
  return null;
}

function validate(body: unknown): ConvertRequest | string {
  const b = body as ConvertRequest;
  if (!b || typeof b.input !== "string" || !b.input.trim()) return "文章を入力してください";
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
  if (b.adjust && (typeof b.adjust !== "string" || b.adjust.length > 200)) {
    return "追加の指示が長すぎます";
  }
  return b;
}

export async function POST(request: Request) {
  const authError = await authorize(request);
  if (authError) return error(401, authError);

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

  const ai = new GoogleGenAI({ apiKey });
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: buildUserPrompt(req),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
        temperature: 0.8,
      },
    });
    const parsed = JSON.parse(res.text ?? "{}") as { candidates?: Candidate[] };
    const candidates = (parsed.candidates ?? [])
      .filter((c) => c && typeof c.text === "string" && c.text.trim())
      .slice(0, 3)
      .map((c) => ({
        subject: c.subject?.trim() || undefined,
        text: c.text.trim(),
        note: c.note?.trim() ?? "",
      }));
    if (candidates.length === 0) return error(502, "うまく変換できませんでした。もう一度試してください");
    return Response.json({ candidates });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
      return error(429, "無料枠の上限に達しました。少し時間をおいてから試してください");
    }
    console.error("convert failed", msg);
    return error(502, "AIへの接続に失敗しました。もう一度試してください");
  }
}
