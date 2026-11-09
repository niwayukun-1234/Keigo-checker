import { vapidKeys } from "@/lib/push-server";

export function GET() {
  const keys = vapidKeys();
  if (!keys) return Response.json({ error: "通知の鍵を用意できません" }, { status: 500 });
  return Response.json({ publicKey: keys.publicKey }, { headers: { "cache-control": "no-store" } });
}
