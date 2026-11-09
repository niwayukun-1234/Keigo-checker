import type { ThinkingLevel } from "@google/genai";
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
