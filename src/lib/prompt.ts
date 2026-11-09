import {
  DESTINATIONS,
  LENGTHS,
  POLITENESS,
  RELATIONS,
  TONES,
  labelOf,
  type ConvertRequest,
} from "./options";

const POLITENESS_GUIDE: Record<number, string> = {
  1: "タメ口。友達同士の普段の話し言葉。敬語は使わない。",
  2: "ゆるめの丁寧語。「〜です」「〜ます」を基本に、親しみのある柔らかい言い回しを混ぜてよい。",
  3: "標準的な丁寧語。「〜です」「〜ます」で統一し、崩した表現は使わない。",
  4: "尊敬語と謙譲語を正しく使い分けたビジネス敬語。",
  5: "最上級の敬語。改まった表現とクッション言葉を使い、非常に丁重にする。",
};

const DESTINATION_GUIDE: Record<string, string> = {
  gmail:
    "メール。subject に件名を入れる。本文は「宛名 → 挨拶 → 本文 → 結び → 署名」の順。段落ごとに空行を入れる。署名情報があれば末尾に付ける。",
  line: "LINE。宛名・署名・件名は不要。1〜3文ごとに改行し、短く区切る。",
  slack:
    "Slack。冒頭は「お疲れさまです」程度の一言。要点を先に書き、必要なら箇条書きを使う。宛名がある場合は先頭に「@名前」を付けてよい。件名・署名は不要。",
  discord:
    "Discord。チャットらしく簡潔に。要点を先に書き、改行で読みやすくする。件名・署名は不要。",
  dm: "Instagram や X のダイレクトメッセージ。メールより軽く LINE より丁寧に。初めて送る相手らしい内容なら簡単な自己紹介を一文入れる。件名・署名は不要。",
  sns: "SNS の投稿やリプライ。不特定多数に見られる前提で短く、140文字以内に収める。宛名・署名・件名は不要。",
  speech:
    "口頭で話すための台本。電話や対面で読み上げやすいリズムで、一文を短く区切る。件名・署名は不要。",
};

const LENGTH_GUIDE: Record<string, string> = {
  short: "元の内容の要点だけを残し、できるだけ短くする。",
  same: "元の内容と同じくらいの分量にする。",
  long: "挨拶やクッション言葉を足して、丁寧で少し長めにする。ただし新しい事実は足さない。",
};

export const SYSTEM_INSTRUCTION = `あなたは日本語の敬語と文章表現の専門家です。
ユーザーが話したり打ったりした文章（口語・誤字・音声入力の誤変換を含むことがあります）を、指定された相手・丁寧度・長さ・トーン・送り先に合った、そのまま送れる文章に書き直します。

守ること:
- 元の文章の意味を変えない。入力にない日付・金額・約束・事実を勝手に足さない。
- 音声入力の誤変換と思われる箇所は、文脈から自然に直す。
- 二重敬語や誤った敬語（「おっしゃられる」「拝見させていただく」など）を使わない。
- 目上には「了解しました」ではなく「承知しました」、「ご苦労さまです」ではなく「お疲れさまです」。
- 「させていただく」を重ねない。「〜のほう」「〜になります」などのバイト敬語を使わない。
- 丁寧度が低い指定のときは、敬語を足しすぎない。
- 名前が分からない場合は「〇〇」のような穴埋めを使わず、名前なしで自然に書く。
- 候補は言い回しを少し変えて 2 つ出す。1つ目が一番おすすめ。
- note は、主に変えた点を 40 字以内で 1 文（例：「行きます」を謙譲語の「伺います」に）。
- 出力は指定の JSON だけにする。`;

export function buildUserPrompt(req: ConvertRequest): string {
  const o = req.options;
  const relation = labelOf(RELATIONS, o.relation);
  const politenessLabel =
    POLITENESS.find((p) => p.level === o.politeness)?.label ?? "";
  const lines: string[] = [];

  lines.push("# 条件");
  lines.push(`- 相手: ${relation}`);
  if (o.recipientName) {
    lines.push(
      `- 相手の名前: ${o.recipientName}${o.recipientHonorific ? `（敬称: ${o.recipientHonorific}）` : ""}`,
    );
  }
  lines.push(
    `- 丁寧度: ${o.politeness}/5（${politenessLabel}）… ${POLITENESS_GUIDE[o.politeness] ?? ""}`,
  );
  lines.push(
    `- 長さ: ${labelOf(LENGTHS, o.length)} … ${LENGTH_GUIDE[o.length] ?? ""}`,
  );
  lines.push(`- トーン: ${labelOf(TONES, o.tone)}`);
  lines.push(
    `- 送り先: ${labelOf(DESTINATIONS, o.destination)} … ${DESTINATION_GUIDE[o.destination] ?? ""}`,
  );
  lines.push(
    `- 絵文字: ${o.emoji ? "自然な範囲で使ってよい" : "使わない"}`,
  );

  const p = req.profile;
  if (p && (p.full_name || p.company || p.signature)) {
    lines.push("");
    lines.push("# 自分（送り主）の情報");
    if (p.full_name) lines.push(`- 名前: ${p.full_name}`);
    if (p.company) lines.push(`- 所属: ${p.company}`);
    if (p.job_title) lines.push(`- 肩書き: ${p.job_title}`);
    if (o.destination === "gmail" && p.signature) {
      lines.push(`- メール署名（末尾にそのまま付ける）:\n${p.signature}`);
    }
  }

  if (req.adjust) {
    lines.push("");
    lines.push(`# 追加の指示\n${req.adjust}`);
  }

  lines.push("");
  lines.push("# 元の文章");
  lines.push(req.input);
  return lines.join("\n");
}

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "メールの件名。送り先がメール以外なら空文字",
          },
          text: { type: "string", description: "そのまま送れる文章" },
          note: { type: "string", description: "主に変えた点（40字以内）" },
        },
        required: ["subject", "text", "note"],
      },
    },
  },
  required: ["candidates"],
} as const;
