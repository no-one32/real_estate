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
  { title: "اختر مشروعاً", text: "من صفحة «مشاريعي»، اختر المشروع الذي تريد مراجعته." },
  { title: "استكشف الإحصائيات", text: "تنقّل بين تبويبي الزيارات والعقارات وحدد الفترة." },
  { title: "أنشئ رمز QR", text: "افتح تبويب رمز QR في المشروع، وحدد الحجم والاسم، ثم حمّل صورة PNG." },
  { title: "تابع العملاء", text: "افتح «جميع العملاء» وصفِّ حسب الاسم أو المشروع أو الحالة." },
];

const FAQS: Faq[] = [
  {
    q: "كيف أغيّر فترة التقرير؟",
    a: "استخدم محدد «الفترة» أعلى صفحة إحصائيات الزيارات أو العقارات. تتحدث كل البطاقات والرسوم في الصفحة حسب الفترة المختارة.",
  },
  {
    q: "هل تنتهي صلاحية رموز QR؟",
    a: "لا. يفتح رمز QR دائماً الجولة المباشرة للمشروع، لذا يبقى الرمز المطبوع يعمل حتى بعد تغيير الأسعار أو حالة الفلل.",
  },
  {
    q: "أين تظهر عمليات مسح رموز QR؟",
    a: "تُحتسب الزيارات القادمة من رمز ممسوح في لوحة «مصادر الزيارات» بصفحة إحصائيات الزيارات.",
  },
  {
    q: "كيف أصدّر الأرقام؟",
    a: "اضغط «تصدير» في أي صفحة إحصائيات واختر إكسل أو PDF لتحميل الأرقام.",
  },
  {
    q: "هل يمكنني البحث في الجداول؟",
    a: "نعم. استخدم حقل البحث في الشريط العلوي للعثور على مشروع أو فيلا أو عميل من أي مكان في لوحة التحكم.",
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
      title: "إدارة المشاريع",
      icon: <IcGrid size={20} stroke={1.5} />,
      text: <>افتح {link("مشاريعي", "projects")} لاختيار مشروع ومراجعة زواره والانتقال إلى إحصائياته.</>,
      plain: "افتح مشاريعي لاختيار مشروع ومراجعة زواره والانتقال إلى إحصائياته.",
    },
    {
      key: "analytics",
      title: "قراءة الإحصائيات",
      icon: <IcChart size={20} stroke={1.6} />,
      text: <>استخدم تبويبي {link("الزيارات", "analytics")} و{link("العقارات", "analytics")}، ثم غيّر الفترة لمقارنة الأداء.</>,
      plain: "استخدم تبويبي الزيارات والعقارات، ثم غيّر الفترة لمقارنة الأداء.",
    },
    {
      key: "contacts",
      title: "متابعة العملاء",
      icon: <IcUsers size={20} stroke={1.5} />,
      text: <>زر {link("جميع العملاء", "contacts")} للبحث عن المشترين ومعرفة حالتهم ومتابعة استفساراتهم.</>,
      plain: "زر جميع العملاء للبحث عن المشترين ومعرفة حالتهم ومتابعة استفساراتهم.",
    },
    {
      key: "qr",
      title: "إنشاء رموز QR",
      icon: <IcQr size={20} stroke={1.5} />,
      text: <>افتح مشروعاً من {link("مشاريعي", "projects")} واستخدم تبويب رمز QR لإنشاء رمز قابل للطباعة يفتح الجولة المباشرة.</>,
      plain: "افتح مشروعاً من مشاريعي واستخدم تبويب رمز QR لإنشاء رمز قابل للطباعة يفتح الجولة المباشرة.",
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
          <h1>مركز المساعدة</h1>
          <p>كل ما تحتاجه للاستفادة القصوى من AXIS Studio</p>
        </div>
        <label className="axh-search">
          <IcSearch size={15} stroke={1.25} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في مواضيع المساعدة..." aria-label="البحث في مواضيع المساعدة" />
        </label>
      </header>

      {nothing ? <p className="axh-empty">لا توجد نتائج لـ «{q.trim()}».</p> : null}

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
              <h2>ابدأ في 4 خطوات</h2>
              <p className="axh-sub">من اختيار المشروع إلى المشاركة</p>
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
              <h2>الأسئلة الشائعة</h2>
              <p className="axh-sub">إجابات سريعة عن الأسئلة المتكررة</p>
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
          <h2>هل تحتاج إلى مساعدة؟</h2>
          <p>يسعد فريقنا أن يرشدك في لوحة التحكم أو يجهّز التتبع لإطلاق مشروع جديد.</p>
        </div>
        <a className="axh-cta-btn" href={`mailto:${SUPPORT_EMAIL}`}>
          تواصل مع الدعم
        </a>
      </section>

      <p className="axh-foot">AXIS Studio · مركز المساعدة</p>
    </section>
  );
}
