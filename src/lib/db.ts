"use client";

import type { Candidate, ConvertOptions, Profile } from "./options";
import { getSupabase } from "./supabase";

export type Contact = {
  id: string;
  name: string;
  honorific: string;
  relation: ConvertOptions["relation"];
  politeness: number;
  destination: ConvertOptions["destination"];
};

export type Preset = { id: string; label: string; options: ConvertOptions };

export type HistoryItem = {
  id: string;
  input: string;
  options: ConvertOptions;
  candidates: Candidate[];
  created_at: string;
};

function sb() {
  const s = getSupabase();
  if (!s) throw new Error("Supabase が設定されていません");
  return s;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const EMPTY_PROFILE: Profile = { full_name: "", company: "", job_title: "", signature: "" };

export async function loadProfile(): Promise<Profile> {
  const data = check(
    await sb().from("profiles").select("full_name, company, job_title, signature").maybeSingle(),
  );
  return (data as Profile | null) ?? EMPTY_PROFILE;
}

export async function saveProfile(p: Profile, userId: string) {
  check(
    await sb()
      .from("profiles")
      .upsert({ ...p, user_id: userId, updated_at: new Date().toISOString() }),
  );
}

export async function listContacts(): Promise<Contact[]> {
  return check(
    await sb()
      .from("contacts")
      .select("id, name, honorific, relation, politeness, destination")
      .order("created_at"),
  ) as Contact[];
}

export async function upsertContact(c: Omit<Contact, "id"> & { id?: string }) {
  const q = c.id
    ? sb().from("contacts").update(c).eq("id", c.id)
    : sb().from("contacts").insert(c);
  check(await q);
}

export async function deleteContact(id: string) {
  check(await sb().from("contacts").delete().eq("id", id));
}

export async function listPresets(): Promise<Preset[]> {
  return check(
    await sb().from("presets").select("id, label, options").order("created_at"),
  ) as Preset[];
}

export async function addPreset(label: string, options: ConvertOptions) {
  check(await sb().from("presets").insert({ label, options }));
}

export async function deletePreset(id: string) {
  check(await sb().from("presets").delete().eq("id", id));
}

export async function listHistory(limit = 50): Promise<HistoryItem[]> {
  return check(
    await sb()
      .from("history")
      .select("id, input, options, candidates, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as HistoryItem[];
}

export async function addHistory(input: string, options: ConvertOptions, candidates: Candidate[]) {
  check(await sb().from("history").insert({ input, options, candidates }));
}

export async function deleteHistory(id: string) {
  check(await sb().from("history").delete().eq("id", id));
}
