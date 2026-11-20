"use client";

import { useEffect, useMemo, useState } from "react";
import { sarParts, type Unit } from "@/lib/complex";

/**
 * "Villa finder": a few questions in Arabic, then the 3 available villas that fit best.
 * Budget, family size and space rank the villas. The two location questions (quiet / lively,
 * what is close by) are asked, but every villa gets the same fixed score for them for now:
 * the exact places (school, park, main road…) are not confirmed on the plan yet.
 */

/** points every villa gets for the two location questions (same for all, so they don't change the ranking) */
const LOCATION_POINTS = 30;

type Answers = {
  budget?: "low" | "mid" | "high" | "any";
  people?: 2 | 4 | 6 | 7;
  space?: "small" | "mid" | "large" | "any";
  mood?: "quiet" | "lively" | "middle" | "any";
  near?: "school" | "park" | "road" | "any";
};
type Key = keyof Answers;
type Option = { value: Answers[Key]; title: string; hint?: string; icon: React.ReactNode };
type Question = { key: Key; title: string; sub: string; options: Option[] };

const fmt = (n: number) => n.toLocaleString("en-US");
const round = (n: number, step: number) => Math.round(n / step) * step;
const q = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))] ?? 0;

/* tiny line icons (24px grid) */
const I = {
  wallet: <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2M3 5v14a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-4" />,
  coins: <><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" /></>,
  gem: <path d="M6 3h12l4 6-10 13L2 9ZM11 3 8 9l4 13 4-13-3-6M2 9h20" />,
  infinity: <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a6 6 0 0 1 12 0v2" /></>,
  users: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" /></>,
  family: <><circle cx="7" cy="6" r="3" /><circle cx="17" cy="6" r="3" /><circle cx="12" cy="13" r="2" /><path d="M2 21v-3a5 5 0 0 1 7-4.6M22 21v-3a5 5 0 0 0-7-4.6M9 21v-1a3 3 0 0 1 6 0v1" /></>,
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />,
  homeBig: <><path d="M2 11 12 3l10 8" /><path d="M4 9.5V21h16V9.5M9 21v-6h6v6" /></>,
  ruler: <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0ZM14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />,
  leaf: <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />,
  road: <path d="M4 21 8 3M20 21 16 3M12 5v2M12 11v2M12 17v2" />,
  school: <><path d="m4 10 8-5 8 5-8 5Z" /><path d="M7 12v5c3 2 7 2 10 0v-5M20 10v6" /></>,
  tree: <><path d="M12 22v-6" /><path d="M8 16h8l-2.5-3.5H16L12 6l-4 6.5h2.5Z" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  shuffle: <path d="M2 18h3.5c2 0 3.3-1 4.5-3l3-6c1.1-2 2.5-3 4.5-3H22M18 2l4 4-4 4M2 6h3.5c1.4 0 2.5.5 3.4 1.5M22 18h-4.5c-1.4 0-2.5-.5-3.4-1.5M18 14l4 4-4 4" />,
};
const Ico = ({ d, size = 20 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
export const IconSparkle = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5 13.8 9a1 1 0 0 0 .6.6L20 11.5l-5.6 1.9a1 1 0 0 0-.6.6L12 19.5 10.2 14a1 1 0 0 0-.6-.6L4 11.5l5.6-1.9a1 1 0 0 0 .6-.6Z" />
    <path d="M19 3v3M17.5 4.5h3" />
  </svg>
);

type Scored = { unit: Unit; score: number; reasons: string[] };

export default function RecommendPanel({
  units,
  priceOf,
  photoOf,
  onPick,
  onClose,
}: {
  units: Unit[];
  priceOf: (u: Unit) => number;
  photoOf: (u: Unit) => string;
  onPick: (u: Unit) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  /** "my answers" summary open */
  const [review, setReview] = useState(false);
  /** a question opened from the summary: once answered, go straight back to the results */
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const pool = useMemo(() => units.filter((u) => u.status === "available"), [units]);

  // budget / space bands follow the villas really on sale
  const bands = useMemo(() => {
    const prices = pool.map(priceOf).filter((n) => n > 0).sort((a, b) => a - b);
    const areas = pool.map((u) => u.surface).filter((n) => n > 0).sort((a, b) => a - b);
    return {
      p1: round(q(prices, 0.34), 10000),
      p2: round(q(prices, 0.67), 10000),
      a1: round(q(areas, 0.34), 5),
      a2: round(q(areas, 0.67), 5),
    };
  }, [pool, priceOf]);


  const questions: Question[] = useMemo(() => {
    const list: Question[] = [
      {
        key: "budget",
        title: "ما هي ميزانيتك؟",
        sub: "نعرض لك الفيلات التي تناسب ميزانيتك",
        options: [
          { value: "low", title: `حتى ${fmt(bands.p1)} ر.س`, hint: "الخيار الأوفر", icon: <Ico d={I.wallet} /> },
          { value: "mid", title: `${fmt(bands.p1)} – ${fmt(bands.p2)} ر.س`, hint: "الفئة المتوسطة", icon: <Ico d={I.coins} /> },
          { value: "high", title: `أكثر من ${fmt(bands.p2)} ر.س`, hint: "الفئة الفاخرة", icon: <Ico d={I.gem} /> },
          { value: "any", title: "ميزانية مرنة", hint: "لا يهم السعر", icon: <Ico d={I.infinity} /> },
        ],
      },
      {
        key: "people",
        title: "كم شخصاً سيسكن في الفيلا؟",
        sub: "لنقترح عدد غرف النوم المناسب",
        options: [
          { value: 2, title: "1 – 2 أشخاص", hint: "زوجان أو شخص واحد", icon: <Ico d={I.user} /> },
          { value: 4, title: "3 – 4 أشخاص", hint: "عائلة صغيرة", icon: <Ico d={I.users} /> },
          { value: 6, title: "5 – 6 أشخاص", hint: "عائلة متوسطة", icon: <Ico d={I.family} /> },
          { value: 7, title: "7 أشخاص أو أكثر", hint: "عائلة كبيرة", icon: <Ico d={I.family} /> },
        ],
      },
      {
        key: "space",
        title: "ما المساحة التي تفضلها؟",
        sub: "مساحة الفيلا الإجمالية",
        options: [
          { value: "small", title: `حتى ${fmt(bands.a1)} م²`, hint: "عملية وسهلة العناية", icon: <Ico d={I.home} /> },
          { value: "mid", title: `${fmt(bands.a1)} – ${fmt(bands.a2)} م²`, hint: "مساحة متوازنة", icon: <Ico d={I.ruler} /> },
          { value: "large", title: `أكثر من ${fmt(bands.a2)} م²`, hint: "مساحة واسعة", icon: <Ico d={I.homeBig} /> },
          { value: "any", title: "لا يهم", hint: "أي مساحة", icon: <Ico d={I.infinity} /> },
        ],
      },
    ];
    {
      list.push(
        {
          key: "mood",
          title: "هل تفضل مكاناً هادئاً أم حيوياً؟",
          sub: "موقع الفيلا داخل المشروع",
          options: [
            { value: "quiet", title: "هادئ", hint: "بعيداً عن الطريق الرئيسي", icon: <Ico d={I.leaf} /> },
            { value: "lively", title: "حيوي", hint: "قرب الطريق السريع", icon: <Ico d={I.music} /> },
            { value: "middle", title: "في الوسط", hint: "قرب المدرسة والخدمات", icon: <Ico d={I.target} /> },
            { value: "any", title: "لا يهم", hint: "أي موقع", icon: <Ico d={I.shuffle} /> },
          ],
        },
        {
          key: "near",
          title: "ماذا تريد أن يكون قريباً منك؟",
          sub: "نختار الفيلات الأقرب إليه",
          options: [
            { value: "school", title: "مدرسة", hint: "للأطفال", icon: <Ico d={I.school} /> },
            { value: "park", title: "حديقة", hint: "مساحات خضراء", icon: <Ico d={I.tree} /> },
            { value: "road", title: "طريق رئيسي", hint: "سهولة التنقل", icon: <Ico d={I.road} /> },
            { value: "any", title: "لا يهم", hint: "", icon: <Ico d={I.shuffle} /> },
          ],
        },
      );
    }
    return list;
  }, [bands]);

  const done = step >= questions.length;

  const results: Scored[] = useMemo(() => {
    if (!done) return [];
    const roomsNeed = { 2: 2, 4: 3, 6: 4, 7: 5 } as const;

    const scored = pool.map((u) => {
      let score = 0;
      let max = 0;
      const reasons: string[] = [];
      const price = priceOf(u);

      // budget (30)
      max += 30;
      const b = answers.budget ?? "any";
      const lo = b === "mid" ? bands.p1 : b === "high" ? bands.p2 : 0;
      const hi = b === "low" ? bands.p1 : b === "mid" ? bands.p2 : Infinity;
      if (b === "any" || (price >= lo && price <= hi)) {
        score += 30;
        if (b !== "any") reasons.push("ضمن ميزانيتك");
      } else if (price > hi && price <= hi * 1.1) score += 14;
      else if (price < lo) score += 18;

      // bedrooms (20)
      max += 20;
      const need = answers.people ? roomsNeed[answers.people] : 0;
      if (!need) score += 20;
      else if (u.rooms >= need) {
        score += Math.max(10, 20 - 4 * (u.rooms - need));
        reasons.push(`${u.rooms} غرف نوم تناسب عائلتك`);
      } else score += Math.max(0, 20 - 10 * (need - u.rooms));

      // space (20)
      max += 20;
      const s = answers.space ?? "any";
      const band = (a: number) => (a <= bands.a1 ? "small" : a <= bands.a2 ? "mid" : "large");
      const order = ["small", "mid", "large"];
      if (s === "any") score += 20;
      else {
        const gap = Math.abs(order.indexOf(band(u.surface)) - order.indexOf(s));
        score += gap === 0 ? 20 : gap === 1 ? 8 : 0;
        if (gap === 0) reasons.push(`مساحة ${fmt(u.surface)} م²`);
      }

      // location (quiet / lively + close by): same fixed score for every villa
      max += 30;
      score += LOCATION_POINTS;
      return { unit: u, score: Math.round((score / Math.max(1, max)) * 100), reasons: [...new Set(reasons)].slice(0, 3) };
    });
    return scored.sort((a, b) => b.score - a.score || priceOf(a.unit) - priceOf(b.unit)).slice(0, 3);
  }, [done, pool, answers, bands, priceOf]);

  const choose = (key: Key, value: Answers[Key]) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    const all = questions.every((x) => next[x.key] !== undefined);
    window.setTimeout(() => {
      if (editing && all) {
        setEditing(false);
        setStep(questions.length);
      } else setStep((s) => s + 1);
    }, 160);
  };
  const restart = () => {
    setAnswers({});
    setStep(0);
    setReview(false);
    setEditing(false);
  };
  const back = () => {
    if (review) return setReview(false);
    setEditing(false);
    setStep((s) => Math.max(0, s - 1));
  };
  const edit = (i: number) => {
    setReview(false);
    setEditing(true);
    setStep(i);
  };
  const answered = questions.filter((x) => answers[x.key] !== undefined).length;
  const optionOf = (x: Question) => x.options.find((o) => o.value === answers[x.key]);

  const cur = questions[step];
  const progress = Math.round((Math.min(step, questions.length) / questions.length) * 100);

  return (
    <aside className="reco" dir="rtl" role="dialog" aria-label="مساعد اختيار الفيلا" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className="reco-head">
        <span className="reco-badge"><IconSparkle size={20} /></span>
        <div>
          <h2>اعثر على فيلتك المثالية</h2>
          <p>{done ? "أفضل 3 فيلات متاحة تناسب إجاباتك" : `أجب عن ${questions.length} أسئلة سريعة`}</p>
        </div>
        <button type="button" className="reco-x" onClick={onClose} aria-label="إغلاق">×</button>
      </header>

      <div className="reco-progress" aria-hidden>
        <i style={{ width: `${done ? 100 : progress}%` }} />
      </div>

      <div className="reco-tools">
        <button type="button" className="reco-tool" onClick={back} disabled={!review && step === 0} title="الرجوع لتغيير الإجابة">
          <Ico d={<path d="M9 6l6 6-6 6" />} size={16} />
          رجوع
        </button>
        <button
          type="button"
          className={`reco-tool${review ? " on" : ""}`}
          onClick={() => setReview((r) => !r)}
          disabled={!answered}
          aria-pressed={review}
          title="عرض إجاباتك"
        >
          <Ico d={<><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>} size={16} />
          إجاباتي
          {answered ? <i>{answered}</i> : null}
        </button>
        {!done && cur && !review ? <span className="reco-step">السؤال {step + 1} من {questions.length}</span> : null}
      </div>

      {review ? (
        <div className="reco-body reco-review">
          <h3>إجاباتك</h3>
          <p className="reco-sub">اضغط على أي سؤال لتغيير إجابتك</p>
          <ol className="reco-answers">
            {questions.map((x, i) => {
              const o = optionOf(x);
              return (
                <li key={x.key}>
                  <button type="button" onClick={() => edit(i)}>
                    <span className="reco-opt-ico">{o?.icon ?? <Ico d={<circle cx="12" cy="12" r="9" />} />}</span>
                    <span className="reco-opt-text">
                      <small>{x.title}</small>
                      <b>{o ? o.title : "لم تتم الإجابة بعد"}</b>
                    </span>
                    <span className="reco-answer-edit">تغيير</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="reco-review-foot">
            {answered === questions.length ? (
              <button type="button" className="reco-go" onClick={() => { setReview(false); setEditing(false); setStep(questions.length); }}>
                عرض النتائج
              </button>
            ) : (
              <button type="button" className="reco-go" onClick={() => setReview(false)}>
                متابعة الأسئلة
              </button>
            )}
            <button type="button" className="reco-restart" onClick={restart}>
              إعادة الأسئلة
            </button>
          </div>
        </div>
      ) : !done && cur ? (
        <div className="reco-body" key={cur.key}>
          <h3>{cur.title}</h3>
          <p className="reco-sub">{cur.sub}</p>
          <div className="reco-options" role="radiogroup" aria-label={cur.title}>
            {cur.options.map((o) => {
              const on = answers[cur.key] === o.value;
              return (
                <button key={String(o.value)} type="button" role="radio" aria-checked={on} className={`reco-opt${on ? " on" : ""}`} onClick={() => choose(cur.key, o.value)}>
                  <span className="reco-opt-ico">{o.icon}</span>
                  <span className="reco-opt-text">
                    <b>{o.title}</b>
                    {o.hint ? <small>{o.hint}</small> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="reco-body results">
          {!pool.length ? (
            <p className="reco-empty">لا توجد فيلات متاحة حالياً.</p>
          ) : (
            <ol className="reco-results">
              {results.map((r, i) => {
                const price = sarParts(priceOf(r.unit));
                const photo = photoOf(r.unit);
                return (
                  <li key={r.unit.id} className={`reco-card${i === 0 ? " best" : ""}`}>
                    <div className="reco-card-top">
                      <span className="reco-photo">
                        {photo ? <img src={photo} alt="" /> : null}
                        <em>{i === 0 ? "الأفضل" : `#${i + 1}`}</em>
                      </span>
                      <div className="reco-card-info">
                        <strong>فيلا <bdi dir="ltr">{r.unit.displayId}</bdi></strong>
                        <span className="reco-price" dir="ltr">
                          <span className="sar-cur">{price.currency}</span> {price.amount}
                        </span>
                        <span className="reco-specs">
                          {r.unit.rooms} غرف · {fmt(r.unit.surface)} م² · {r.unit.floor} طوابق
                        </span>
                      </div>
                      <span className="reco-match" style={{ ["--p" as string]: `${r.score}` }}>
                        <b>{r.score}%</b>
                        <small>تطابق</small>
                      </span>
                    </div>
                    {r.reasons.length ? (
                      <div className="reco-reasons">
                        {r.reasons.map((t) => <span key={t}>✓ {t}</span>)}
                      </div>
                    ) : null}
                    <button type="button" className="reco-go" onClick={() => onPick(r.unit)}>
                      عرض الفيلا على المخطط
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <button type="button" className="reco-restart" onClick={restart}>
            إعادة الأسئلة
          </button>
        </div>
      )}
    </aside>
  );
}
