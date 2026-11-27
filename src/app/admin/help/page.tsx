"use client";

import { useState } from "react";
import Link from "next/link";
import AdminShell from "../AdminShell";
import { Ai360, AiCube, AiGlobe } from "../AdminIcons";

const SECTIONS = [
  {
    key: "portals",
    icon: <AiGlobe size={20} />,
    title: "Portals Management",
    href: "/admin",
    steps: [
      "Press “Create New Portal”, give the project a name and a city.",
      "In “Branding”, add the agency logo, the project logo, the gallery (one cover photo + exterior / interior folders) and the orbit photos.",
      "In “Manage → Units”, import the villas file; in “Clients”, invite the client and add them to the portal.",
      "Use the ··· menu to set the portal Active (tour live), Pending (not live yet) or Suspended (taken offline).",
    ],
  },
  {
    key: "tours",
    icon: <Ai360 size={20} />,
    title: "360° Tour Builder",
    href: "/admin/tours",
    steps: [
      "Pick a project and press “Add panoramas” (2:1 images named 1.jpg, 2.jpg… — the number is the order).",
      "Click a panorama to open the editor. Drag to look around, click inside the picture to drop a button.",
      "Choose which scene the button opens and give it a name (مجلس, Kitchen, Living room…). Move or delete buttons any time.",
      "Tick “Start the 360 tour on this scene” for the first scene, then press Save — the buttons appear in the tour.",
    ],
  },
  {
    key: "glb",
    icon: <AiCube size={20} />,
    title: "WebGL / GLB Studio",
    href: "/admin/glb",
    steps: [
      "Upload the project’s .glb model (each villa as its own named mesh). Keep it under 25 MB.",
      "Press “Edit pins”: the model opens. Turn and zoom, click a point to drop a pin.",
      "Choose what the pin does: open a 360° scene, show an info card, or open a link.",
      "Press Save. Until the first save the tour keeps its current pins; they are shown as the starting point.",
    ],
  },
];

const FAQ = [
  { q: "A client cannot sign in.", a: "Open Clients and press the send icon next to their name: they get a new email to set their password." },
  { q: "I changed photos but the tour still shows the old ones.", a: "Browsers keep pictures for a while. Reload the tour with Ctrl + Shift + R." },
  { q: "What does Suspended do?", a: "The portal’s tour goes offline for visitors, exactly like Pending. It only tells you it was taken offline on purpose." },
  { q: "How do I change my password or photo?", a: "Open Settings (bottom of the menu, or your name at the top right)." },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <AdminShell>
      <header className="axa-head">
        <div>
          <h1>Help</h1>
          <p>How to build a client portal, its 360° tour and its 3D model.</p>
        </div>
      </header>

      <div className="axa-help">
        {SECTIONS.map((s) => (
          <section key={s.key} className="axa-panel">
            <header className="axa-panel-title">
              <span className="axa-list-ico">{s.icon}</span>
              <h2>{s.title}</h2>
              <Link href={s.href} className="axa-link">Open →</Link>
            </header>
            <ol className="axa-help-steps">
              {s.steps.map((t, i) => (
                <li key={i}>
                  <span className="axa-scene-n">{i + 1}</span>
                  <p>{t}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="axa-panel">
        <header className="axa-panel-title"><h2>Questions</h2></header>
        <div className="axa-faq">
          {FAQ.map((f, i) => (
            <div key={i} className={open === i ? "open" : ""}>
              <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <span>{f.q}</span>
                <i aria-hidden>{open === i ? "−" : "+"}</i>
              </button>
              {open === i && <p>{f.a}</p>}
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
