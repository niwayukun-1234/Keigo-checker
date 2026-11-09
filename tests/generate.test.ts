// node --test で動かす（Node 24 は型を取り除いてそのまま実行できる）
import { test } from "node:test";
import assert from "node:assert/strict";
import { streamWithFallback, type Attempt, type StartStream } from "../src/lib/generate.ts";

/** 指定どおりにチャンクを返す偽のストリーム。abort されたら止まる */
function fakeStream(chunks: { text: string; delay: number }[], signal: AbortSignal) {
  return (async function* () {
    for (const c of chunks) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, c.delay);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
      yield { text: c.text };
    }
  })();
}

async function collect(it: AsyncIterable<string>) {
  let s = "";
  for await (const t of it) s += t;
  return s;
}

const attempts: Attempt[] = [
  { model: "quality", thinkingLevel: "LOW", firstChunkTimeoutMs: 100 },
  { model: "fast", thinkingLevel: "MINIMAL", firstChunkTimeoutMs: 100 },
];

test("1つ目のモデルが書き始めないときは、待ち続けずに次のモデルに切り替える", async () => {
  const calls: string[] = [];
  const start: StartStream = async (a, signal) => {
    calls.push(a.model);
    if (a.model === "quality") return fakeStream([{ text: "遅い", delay: 5_000 }], signal);
    return fakeStream([{ text: '{"a":', delay: 10 }, { text: "1}", delay: 10 }], signal);
  };
  const t0 = Date.now();
  const r = await streamWithFallback(attempts, start, { idleTimeoutMs: 500, totalTimeoutMs: 5_000 });
  assert.equal(r.model, "fast");
  assert.equal(await collect(r.chunks), '{"a":1}');
  assert.deepEqual(calls, ["quality", "fast"]);
  assert.ok(Date.now() - t0 < 1_000, "切り替えまで長く待たない");
});

test("混雑（503）や無料枠切れ（429）なら次のモデルで作り直す", async () => {
  for (const status of [503, 429, 500]) {
    const start: StartStream = async (a, signal) => {
      if (a.model === "quality") throw Object.assign(new Error(`got status ${status}`), { status });
      return fakeStream([{ text: "ok", delay: 5 }], signal);
    };
    const r = await streamWithFallback(attempts, start, { idleTimeoutMs: 500, totalTimeoutMs: 5_000 });
    assert.equal(r.model, "fast");
    assert.equal(await collect(r.chunks), "ok");
  }
});

test("書き始めてから途中で止まったら、いつまでも待たずにエラーにする", async () => {
  const start: StartStream = async (_a, signal) =>
    fakeStream([{ text: "途中", delay: 5 }, { text: "続き", delay: 5_000 }], signal);
  const r = await streamWithFallback(attempts, start, { idleTimeoutMs: 100, totalTimeoutMs: 5_000 });
  const t0 = Date.now();
  await assert.rejects(collect(r.chunks), /止まりました/);
  assert.ok(Date.now() - t0 < 1_000);
});

test("どのモデルもだめなら、最後のエラーを返す", async () => {
  const start: StartStream = async () => {
    throw Object.assign(new Error("RESOURCE_EXHAUSTED quota"), { status: 429 });
  };
  await assert.rejects(streamWithFallback(attempts, start, { idleTimeoutMs: 100, totalTimeoutMs: 5_000 }), /RESOURCE_EXHAUSTED/);
});

test("入力の誤りなど、作り直しても直らないエラーはすぐ返す", async () => {
  const calls: string[] = [];
  const start: StartStream = async (a) => {
    calls.push(a.model);
    throw Object.assign(new Error("bad request"), { status: 400 });
  };
  await assert.rejects(streamWithFallback(attempts, start, { idleTimeoutMs: 100, totalTimeoutMs: 5_000 }), /bad request/);
  assert.deepEqual(calls, ["quality"]);
});

test("空のチャンクだけでは書き始めたとみなさない", async () => {
  const start: StartStream = async (a, signal) =>
    a.model === "quality"
      ? fakeStream([{ text: "", delay: 5 }, { text: "", delay: 5 }, { text: "x", delay: 5_000 }], signal)
      : fakeStream([{ text: "y", delay: 5 }], signal);
  const r = await streamWithFallback(attempts, start, { idleTimeoutMs: 500, totalTimeoutMs: 5_000 });
  assert.equal(r.model, "fast");
  assert.equal(await collect(r.chunks), "y");
});

test("少しずつ届き続けても、全体の締め切りを過ぎたらエラーにする", async () => {
  const start: StartStream = async (_a, signal) =>
    fakeStream(Array.from({ length: 50 }, () => ({ text: "あ", delay: 80 })), signal);
  const r = await streamWithFallback(attempts, start, { idleTimeoutMs: 200, totalTimeoutMs: 400 });
  const t0 = Date.now();
  await assert.rejects(collect(r.chunks), /止まりました/);
  assert.ok(Date.now() - t0 < 1_000);
});
