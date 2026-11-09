"use client";

// 写真を送る前に端末側で縮小・圧縮して、通信量とAIの処理時間を減らす。
// スクショの文字が読める程度（長辺1600px・JPEG品質0.8）にする。

const MAX_SIDE = 1600;
const QUALITY = 0.8;

export type PreparedImage = { mimeType: string; data: string; previewUrl: string };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = url;
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください");
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(srcUrl);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を処理できませんでした");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    return { mimeType: "image/jpeg", data: dataUrl.split(",")[1], previewUrl: dataUrl };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}
