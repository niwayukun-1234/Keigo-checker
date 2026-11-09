import type { Candidate } from "./options";

// AIが少しずつ返してくる JSON（{"candidates":[{"subject":"..","text":"..","note":".."},...]}）を、
// 途中の状態でも読み取って候補を組み立てる。書きかけの文字列もそこまでの分を返す。

function decode(raw: string): string {
  // 末尾が書きかけのエスケープ（\ や \u12）なら落とす
  const safe = raw.replace(/\\(u[0-9a-fA-F]{0,3})?$/, "");
  try {
    return JSON.parse(`"${safe}"`);
  } catch {
    return safe.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

export function parsePartialCandidates(buf: string): Candidate[] {
  const out: Candidate[] = [];
  let cur: Partial<Candidate> | null = null;
  const re = /"(subject|text|note)"\s*:\s*"((?:[^"\\]|\\.)*)("?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buf))) {
    const key = m[1] as keyof Candidate;
    if (!cur || key in cur) {
      cur = {};
      out.push(cur as Candidate);
    }
    cur[key] = decode(m[2]);
  }
  return out.map((c) => ({
    subject: c.subject?.trim() || undefined,
    text: c.text ?? "",
    note: c.note ?? "",
  }));
}
