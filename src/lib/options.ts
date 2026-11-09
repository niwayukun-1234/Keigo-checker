// 変換オプションの定義（画面とサーバーで共通）

export const RELATIONS = [
  { id: "friend", label: "友達", defaultPoliteness: 1 },
  { id: "colleague", label: "同僚", defaultPoliteness: 2 },
  { id: "senpai", label: "先輩", defaultPoliteness: 3 },
  { id: "boss", label: "上司", defaultPoliteness: 4 },
  { id: "executive", label: "上司の上司", defaultPoliteness: 5 },
  { id: "client", label: "取引先・お客様", defaultPoliteness: 5 },
  { id: "teacher", label: "先生", defaultPoliteness: 4 },
] as const;

export const POLITENESS = [
  { level: 1, label: "タメ口" },
  { level: 2, label: "ゆるめ" },
  { level: 3, label: "丁寧語" },
  { level: 4, label: "尊敬・謙譲" },
  { level: 5, label: "最上級" },
] as const;

export const LENGTHS = [
  { id: "short", label: "短く" },
  { id: "same", label: "そのまま" },
  { id: "long", label: "長く" },
] as const;

export const TONES = [
  { id: "serious", label: "真面目" },
  { id: "soft", label: "やわらかい" },
  { id: "cheerful", label: "元気" },
  { id: "apology", label: "謝罪" },
  { id: "thanks", label: "感謝" },
] as const;

export const DESTINATIONS = [
  { id: "gmail", label: "Gmail・メール" },
  { id: "line", label: "LINE" },
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
  { id: "dm", label: "Instagram・XのDM" },
  { id: "sns", label: "SNS投稿・リプライ" },
  { id: "speech", label: "口頭（台本）" },
] as const;

export type RelationId = (typeof RELATIONS)[number]["id"];
export type LengthId = (typeof LENGTHS)[number]["id"];
export type ToneId = (typeof TONES)[number]["id"];
export type DestinationId = (typeof DESTINATIONS)[number]["id"];

export type ConvertOptions = {
  relation: RelationId;
  politeness: number; // 1-5
  length: LengthId;
  tone: ToneId;
  destination: DestinationId;
  emoji: boolean;
  recipientName?: string;
  recipientHonorific?: string;
};

export type Profile = {
  full_name: string;
  company: string;
  job_title: string;
  signature: string;
};

export type ConvertRequest = {
  input: string;
  options: ConvertOptions;
  profile?: Partial<Profile>;
  adjust?: string; // 「もう少し短く」などの追加指示
};

export type Candidate = {
  subject?: string;
  text: string;
  note: string;
};

export const DEFAULT_OPTIONS: ConvertOptions = {
  relation: "boss",
  politeness: 4,
  length: "same",
  tone: "serious",
  destination: "slack",
  emoji: false,
};

export function labelOf<T extends { id: string; label: string }>(
  list: readonly T[],
  id: string,
): string {
  return list.find((x) => x.id === id)?.label ?? id;
}

export const MAX_INPUT_LENGTH = 2000;

// 変換の途中でエラーが起きたときに、ストリームの最後に付ける目印
export const STREAM_ERROR_MARK = "\u0000ERROR:";
