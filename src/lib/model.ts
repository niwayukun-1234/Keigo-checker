import type { ThinkingLevel } from "@google/genai";
import type { Attempt } from "./generate";
import type { ConvertOptions } from "./options";

// 速さと質の両立のため、場面に応じてモデルを使い分ける。
// - ふだん（友達・先輩・同僚、丁寧度1〜3）: 軽くて速い lite モデル
// - 失敗できない場面（丁寧度4以上、取引先・上司の上司、メール、謝罪）: 敬語に強い通常モデル
// どちらも環境変数で差し替えられる。

const FAST_MODEL = process.env.GEMINI_MODEL_FAST || "gemini-3.5-flash-lite";
const QUALITY_MODEL = process.env.GEMINI_MODEL_QUALITY || "gemini-3.8-flash";

export type ModelChoice = { model: string; thinkingLevel: ThinkingLevel; tier: "fast" | "quality" };

export function needsQuality(o: ConvertOptions): boolean {
  return (
    o.politeness >= 4 ||
    o.relation === "client" ||
    o.relation === "executive" ||
    o.destination === "gmail" ||
    o.tone === "apology"
  );
}

function lowestThinking(model: string): ThinkingLevel {
  // lite は minimal に対応。通常の flash は low が最小
  return (model.includes("lite") ? "MINIMAL" : "LOW") as ThinkingLevel;
}

export function chooseModel(o: ConvertOptions): ModelChoice {
  const tier = needsQuality(o) ? "quality" : "fast";
  const model = tier === "quality" ? QUALITY_MODEL : FAST_MODEL;
  return { model, thinkingLevel: lowestThinking(model), tier };
}

// 1つ目のモデルがこの時間内に書き始めなければ、もう一方のモデルで作り直す。
// 合計しても関数の上限（route.ts の maxDuration）に収まるようにしておく。
const FIRST_TRY_TIMEOUT_MS = 12_000;
const SECOND_TRY_TIMEOUT_MS = 15_000;
/** 書き始めた後、この時間なにも届かなければ止まったとみなす */
export const IDLE_TIMEOUT_MS = 20_000;
/** 生成全体の締め切り。route.ts の maxDuration（60秒）より短くして、自分でエラーを返せるようにする */
export const TOTAL_TIMEOUT_MS = 52_000;

/**
 * 試す順番。混雑・無料枠切れ・応答の遅れに備えて、もう一方のモデルを控えにする
 * （無料枠の上限はモデルごとなので、片方が上限でももう片方は使えることが多い）。
 */
export function planAttempts(o: ConvertOptions): Attempt[] {
  const first = chooseModel(o);
  const backupModel = first.model === QUALITY_MODEL ? FAST_MODEL : QUALITY_MODEL;
  const attempts: Attempt[] = [
    { model: first.model, thinkingLevel: first.thinkingLevel, firstChunkTimeoutMs: FIRST_TRY_TIMEOUT_MS },
  ];
  if (backupModel !== first.model) {
    attempts.push({
      model: backupModel,
      thinkingLevel: lowestThinking(backupModel),
      firstChunkTimeoutMs: SECOND_TRY_TIMEOUT_MS,
    });
  }
  return attempts;
}
