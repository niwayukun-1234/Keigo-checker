// AI の応答を待ちすぎないための仕組み。
// - モデルが一定時間書き始めなければ、止めて次のモデルで作り直す
// - 混雑（503）や無料枠切れ（429）でも、次のモデルで作り直す
// - 書き始めた後に途中で止まったら、いつまでも待たずにエラーにする
// テストから Node で直接読み込めるよう、ここでは実行時の import をしない。

export type Attempt = {
  model: string;
  thinkingLevel: string;
  /** この時間内に最初の文字が届かなければ、次のモデルに切り替える */
  firstChunkTimeoutMs: number;
};

export type StartStream = (
  attempt: Attempt,
  signal: AbortSignal,
) => Promise<AsyncIterable<{ text?: string }>>;

export type StreamResult = {
  model: string;
  chunks: AsyncIterable<string>;
};

export const STALLED_MESSAGE = "AIの応答が途中で止まりました";
export const SLOW_MESSAGE = "AIの応答が遅すぎました";

class TimeoutError extends Error {}

/** 作り直しても直らないエラー（入力の誤り・キーの誤り）は待たずに返す */
function isRetryable(e: unknown): boolean {
  if (e instanceof TimeoutError) return true;
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number") return status !== 400 && status !== 401 && status !== 403;
  return true;
}

/** promise を ms で打ち切る。負けた側の拒否は握りつぶす（未処理の拒否にしない） */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  promise.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), Math.max(0, ms));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type Started = { first: string; it: AsyncIterator<{ text?: string }>; controller: AbortController };

function stop(controller: AbortController, it: AsyncIterator<unknown> | undefined) {
  controller.abort();
  it?.return?.()?.catch(() => {});
}

/** 1 つのモデルで、最初の文字が届くまで待つ */
async function startAttempt(attempt: Attempt, start: StartStream): Promise<Started> {
  const controller = new AbortController();
  const deadline = Date.now() + attempt.firstChunkTimeoutMs;
  let it: AsyncIterator<{ text?: string }> | undefined;
  try {
    const stream = await withTimeout(start(attempt, controller.signal), deadline - Date.now(), SLOW_MESSAGE);
    it = stream[Symbol.asyncIterator]();
    for (;;) {
      const r = await withTimeout(it.next(), deadline - Date.now(), SLOW_MESSAGE);
      if (r.done) throw new Error("AIから空の応答が返りました");
      if (r.value.text) return { first: r.value.text, it, controller };
    }
  } catch (e) {
    stop(controller, it);
    throw e;
  }
}

async function* rest(s: Started, idleTimeoutMs: number, deadline: number): AsyncGenerator<string> {
  yield s.first;
  try {
    for (;;) {
      // 少しずつ届き続ける場合も、全体の締め切りを過ぎたら止める（関数の上限で黙って切られないように）
      const wait = Math.min(idleTimeoutMs, deadline - Date.now());
      const r = await withTimeout(s.it.next(), wait, STALLED_MESSAGE);
      if (r.done) return;
      if (r.value.text) yield r.value.text;
    }
  } catch (e) {
    stop(s.controller, s.it);
    throw e;
  }
}

/**
 * attempts を順に試し、最初に書き始めたモデルのストリームを返す。
 * 全部だめなら最後のエラーを投げる。
 */
export async function streamWithFallback(
  attempts: Attempt[],
  start: StartStream,
  opts: { idleTimeoutMs: number; totalTimeoutMs: number },
): Promise<StreamResult> {
  const deadline = Date.now() + opts.totalTimeoutMs;
  let lastError: unknown = new Error("使えるモデルがありません");
  for (const attempt of attempts) {
    try {
      const s = await startAttempt(attempt, start);
      return { model: attempt.model, chunks: rest(s, opts.idleTimeoutMs, deadline) };
    } catch (e) {
      lastError = e;
      if (!isRetryable(e)) break;
      console.warn("convert attempt failed", attempt.model, e instanceof Error ? e.message : String(e));
    }
  }
  throw lastError;
}
