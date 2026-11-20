"use client";

import { useEffect, useRef, useState } from "react";
import { IcAssistant } from "./DashIcons";

type Msg = { role: "user" | "assistant"; content: string };

const STORE_KEY = "axd-assistant-chat";
const SUGGESTIONS = [
  "كم عدد الزوار هذا الأسبوع؟",
  "ما هي الفيلات الأكثر مشاهدة؟",
  "من هم آخر العملاء الذين تواصلوا معي؟",
  "أي رمز QR يجلب أكثر عدد من الزيارات؟",
  "كم فيلا متاحة للبيع؟",
  "ما هي الفيلات الأكثر إضافة إلى المفضلة؟",
];

const GENERIC_ERROR = "The assistant is not available right now. Please try again later.";

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

export default function AssistantView() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // keep the conversation while the tab stays open
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE_KEY);
      if (saved) setMsgs(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30)));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setText("");
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/client/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json().catch(() => ({}));
      // never show technical server errors to the client
      if (res.status === 429) throw new Error("Too many questions in a short time. Wait a minute and try again.");
      if (!res.ok || !json.answer) throw new Error(GENERIC_ERROR);
      setMsgs((m) => [...m, { role: "assistant", content: json.answer }]);
    } catch (e) {
      setErr(e instanceof Error && e.message.startsWith("Too many") ? e.message : GENERIC_ERROR);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    setMsgs([]);
    setErr("");
  };

  return (
    <section className="axd-page axas">
      <header className="axd-head">
        <span className="axd-accent" aria-hidden="true" />
        <div className="axas-headtext">
          <h1>Assistant</h1>
          <p>Ask about your visitors, villas, contacts and QR codes</p>
        </div>
        {msgs.length ? (
          <button type="button" className="axas-clear" onClick={clear}>
            New chat
          </button>
        ) : null}
      </header>

      <div className="axas-box">
        <div className="axas-list" ref={listRef} aria-live="polite">
          {!msgs.length ? (
            <div className="axas-empty">
              <span className="axas-ico"><IcAssistant size={26} stroke={1.8} /></span>
              <b>How can I help?</b>
              <span>I read the data of your projects. Ask in English, French or Arabic.</span>
              <div className="axas-sugs">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" dir="auto" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={`axas-msg ${m.role}`} dir={isArabic(m.content) ? "rtl" : "ltr"}>
                {m.content}
              </div>
            ))
          )}
          {busy ? (
            <div className="axas-msg assistant axas-typing" aria-label="The assistant is writing">
              <i /><i /><i />
            </div>
          ) : null}
        </div>

        {err ? <p className="axas-err">{err}</p> : null}

        <form
          className="axas-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <textarea
            ref={inputRef}
            value={text}
            dir="auto"
            rows={1}
            maxLength={1500}
            placeholder="Ask a question…"
            aria-label="Your question"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          <button type="submit" disabled={busy || !text.trim()}>
            Send
          </button>
        </form>
        <p className="axas-note">Answers come from an AI and can contain mistakes. Check important numbers in Analytics and Contacts.</p>
      </div>
    </section>
  );
}
