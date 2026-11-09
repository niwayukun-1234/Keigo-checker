"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import {
  EMPTY_PROFILE,
  listContacts,
  listPersonas,
  listPresets,
  loadProfile,
  type Contact,
  type HistoryItem,
  type Persona,
  type Preset,
} from "@/lib/db";
import type { Profile } from "@/lib/options";
import { ConvertView } from "./ConvertView";
import { ContactsView } from "./ContactsView";
import { HistoryView } from "./HistoryView";
import { SettingsView } from "./SettingsView";
import { Login } from "./Login";

type Tab = "convert" | "contacts" | "history" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "convert", label: "変換", icon: "M4 6h16M4 12h10M4 18h7" },
  { id: "contacts", label: "連絡先", icon: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  { id: "history", label: "履歴", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
  { id: "settings", label: "設定", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2" },
];

export function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("convert");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [opened, setOpened] = useState<HistoryItem | null>(null);
  const [convertKey, setConvertKey] = useState(0);

  const sb = getSupabase();

  useEffect(() => {
    if (!sb) {
      const id = setTimeout(() => setReady(true), 0);
      return () => clearTimeout(id);
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const reload = useCallback(() => {
    loadProfile().then(setProfile).catch(() => {});
    listContacts().then(setContacts).catch(() => {});
    listPersonas().then(setPersonas).catch(() => setPersonas([]));
    listPresets().then(setPresets).catch(() => {});
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (userId) reload();
  }, [userId, reload]);

  if (!sb) {
    return (
      <div className="mx-auto max-w-md p-6 text-sm">
        <h1 className="mb-2 text-lg font-bold">設定が足りません</h1>
        <p>NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を環境変数に設定してください。</p>
      </div>
    );
  }
  if (!ready) return null;
  if (!session) return <Login />;

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">敬語チェッカー</h1>
        {profile.full_name && <span className="text-xs text-zinc-400">{profile.full_name}</span>}
      </header>

      <main>
        <div className={tab === "convert" ? "" : "hidden"}>
          <ConvertView
            key={convertKey}
            session={session}
            profile={profile}
            personas={personas}
            contacts={contacts}
            presets={presets}
            onPresetsChanged={reload}
            initial={opened}
          />
        </div>
        {tab === "contacts" && <ContactsView contacts={contacts} personas={personas} onChanged={reload} />}
        {tab === "history" && (
          <HistoryView
            onOpen={(h) => {
              setOpened(h);
              setConvertKey((k) => k + 1);
              setTab("convert");
            }}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            key={JSON.stringify(profile)}
            userId={session.user.id}
            email={session.user.email ?? ""}
            profile={profile}
            personas={personas}
            presets={presets}
            onChanged={reload}
          />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                tab === t.id ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-500"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
