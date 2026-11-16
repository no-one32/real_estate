"use client";

import { useMemo, useState } from "react";
import type { ClientView } from "./ClientShell";
import { IcChart, IcGrid, IcQr, IcSearch, IcUsers } from "./DashIcons";

/** Where "Contact support" sends the client. */
const SUPPORT_EMAIL = "support@axis-studio.com";

type Topic = {
  key: string;
  title: string;
  icon: React.ReactNode;
  /** text with [[link]] parts that open a page */
  text: React.ReactNode;
  plain: string;
};

type Step = { title: string; text: string };
type Faq = { q: string; a: string };

const STEPS: Step[] = [
  { title: "Pick a project", text: "On My Projects, select the development you want to review." },
  { title: "Explore analytics", text: "Switch between Traffic and Property tabs and set the period filter." },
  { title: "Generate a QR code", text: "Open the QR tab of a project, set the size and label, then download the PNG." },
  { title: "Follow up leads", text: "Open All Contacts and filter by name, project or status." },
];

const FAQS: Faq[] = [
  {
    q: "How do I change the reporting period?",
    a: "Use the Period selector at the top of the Traffic or Property Analytics page. Every card and chart on the page updates to the chosen range.",
  },
  {
    q: "Do my QR codes expire?",
    a: "No. A QR code always opens the project's live tour, so a printed code keeps working even after you change prices or villa status.",
  },
  {
    q: "Where do QR scans appear?",
    a: "Visits coming from a scanned code are counted in the Traffic Sources panel of the Traffic Analytics page.",
  },
  {
    q: "How do I export the numbers?",
    a: "Click Export CSV on either analytics page to download a summary of the KPI cards.",
  },
  {
    q: "Can I search the tables?",
    a: "Yes. Use the search field in the top bar to find a project, a villa or a contact from anywhere in the dashboard.",
  },
];

export default function HelpView({ onView }: { onView: (v: ClientView) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<number, boolean>>(() => Object.fromEntries(FAQS.map((_, i) => [i, true])));

  const link = (label: string, v: ClientView) => (
    <button type="button" className="axh-link" onClick={() => onView(v)}>
      {label}
    </button>
  );

  const topics: Topic[] = [
    {
      key: "projects",
      title: "Manage projects",
      icon: <IcGrid size={20} stroke={1.5} />,
      text: <>Open {link("My Projects", "projects")} to select a development, review its visitors and jump into analytics.</>,
      plain: "Open My Projects to select a development, review its visitors and jump into analytics.",
    },
    {
      key: "analytics",
      title: "Read analytics",
      icon: <IcChart size={20} stroke={1.6} />,
      text: <>Use the {link("Traffic", "analytics")} and {link("Property", "analytics")} tabs, then change the period filter to compare performance.</>,
      plain: "Use the Traffic and Property tabs, then change the period filter to compare performance.",
    },
    {
      key: "contacts",
      title: "Track leads",
      icon: <IcUsers size={20} stroke={1.5} />,
      text: <>Visit {link("All Contacts", "contacts")} to search buyers, check their status and follow up on inquiries.</>,
      plain: "Visit All Contacts to search buyers, check their status and follow up on inquiries.",
    },
    {
      key: "qr",
      title: "Create QR codes",
      icon: <IcQr size={20} stroke={1.5} />,
      text: <>Open a project from {link("My Projects", "projects")} and use its QR tab to make a printable code that opens the live tour.</>,
      plain: "Open a project from My Projects and use its QR tab to make a printable code that opens the live tour.",
    },
  ];

  const needle = q.trim().toLowerCase();
  const hit = (...parts: string[]) => !needle || parts.join(" ").toLowerCase().includes(needle);
  const shownTopics = topics.filter((t) => hit(t.title, t.plain));
  const shownSteps = useMemo(() => STEPS.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => hit(s.title, s.text)), [needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownFaqs = useMemo(() => FAQS.map((f, i) => ({ ...f, i })).filter((f) => hit(f.q, f.a)), [needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const nothing = needle && !shownTopics.length && !shownSteps.length && !shownFaqs.length;

  return (
    <section className="axh">
      <header className="axh-head">
        <div>
          <h1>Help Center</h1>
          <p>Everything you need to get the most out of AXIS Studio</p>
        </div>
        <label className="axh-search">
          <IcSearch size={15} stroke={1.25} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help topics..." aria-label="Search help topics" />
        </label>
      </header>

      {nothing ? <p className="axh-empty">Nothing found for “{q.trim()}”.</p> : null}

      {shownTopics.length ? (
        <div className="axh-topics">
          {shownTopics.map((t) => (
            <article key={t.key} className="axh-card axh-topic">
              <span className="axh-ico">{t.icon}</span>
              <div>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {shownSteps.length || shownFaqs.length ? (
        <div className="axh-cols">
          {shownSteps.length ? (
            <section className="axh-card axh-panel">
              <h2>Getting started in 4 steps</h2>
              <p className="axh-sub">From project selection to sharing</p>
              <ol className="axh-steps">
                {shownSteps.map((s) => (
                  <li key={s.n}>
                    <span className="axh-num">{s.n}</span>
                    <div>
                      <b>{s.title}</b>
                      <span>{s.text}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {shownFaqs.length ? (
            <section className="axh-card axh-panel">
              <h2>Frequently asked questions</h2>
              <p className="axh-sub">Quick answers to common questions</p>
              <div className="axh-faqs">
                {shownFaqs.map((f) => {
                  const isOpen = open[f.i] || Boolean(needle);
                  return (
                    <div key={f.i} className={`axh-faq${isOpen ? " open" : ""}`}>
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [f.i]: !o[f.i] }))}>
                        <span>{f.q}</span>
                        <i aria-hidden>{isOpen ? "−" : "+"}</i>
                      </button>
                      {isOpen ? <p>{f.a}</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      <section className="axh-cta">
        <div>
          <h2>Still need a hand?</h2>
          <p>Our studio team is happy to walk you through the dashboard or set up tracking for a new launch.</p>
        </div>
        <a className="axh-cta-btn" href={`mailto:${SUPPORT_EMAIL}`}>
          Contact support
        </a>
      </section>

      <p className="axh-foot">AXIS Studio · Help Center</p>
    </section>
  );
}
