const guideSections = [
  { number: "01", title: "مؤشرات المراحل", text: "تعرض البطاقات نسبة التحقق الموزونة لكل مرحلة. اختر أي بطاقة لتغيير تفاصيل التحليل، ويضيء مستوى النضج المناسب: أولي أو جزئي أو متقدم." },
  { number: "02", title: "الفلاتر الذكية", text: "استخدم القطاع والوحدة الرئيسية والوحدة الفرعية والعنصر لتضييق النتائج. تتحدث نسب المراحل الثلاث فورًا، وتُخفى منطقة التفصيل عند اكتمال الفلاتر الأربعة." },
  { number: "03", title: "تفصيل المرحلة", text: "بدّل بين العناصر والوحدات الرئيسية والوحدات الفرعية، ثم اضغط على أي بند لعرض السجلات والمعرفات ونسبة التحقق التي كوّنت النتيجة." },
  { number: "04", title: "تحديث البيانات", text: "من صفحة رفع البيانات اختر ملف Excel مطابقًا للهيكل. يُفحص الملف قبل الرفع، ثم يصبح إصدارًا جديدًا ونشطًا دون حذف الإصدارات السابقة." },
];

export default function GuidePage() {
  return (
    <main className="content-page">
      <header className="content-topbar">
        <a className="compact-brand" href="/"><img src="/mngdp-logo.png" alt="برنامج تطوير وزارة الحرس الوطني" /></a>
        <nav className="site-nav" aria-label="التنقل الرئيسي">
          <a href="/">لوحة التحليل</a><a className="active" href="/guide">الدليل الإرشادي</a><a href="/upload">رفع البيانات</a>
        </nav>
      </header>

      <section className="page-hero guide-hero">
        <p>دليل الاستخدام</p>
        <h1>كيف تستخدم لوحة قياس النضج؟</h1>
        <span>شرح مبسط لكل جزء، من قراءة المؤشرات إلى تحديث البيانات وإدارة الإصدارات.</span>
      </section>

      <section className="guide-grid">
        {guideSections.map((section) => (
          <article className="guide-card" key={section.number}>
            <b>{section.number}</b><div><h2>{section.title}</h2><p>{section.text}</p></div>
          </article>
        ))}
      </section>

      <section className="guide-note">
        <div><strong>كيف تُحسب النسبة؟</strong><p>مجموع الأوزان المكتسبة ÷ مجموع أوزان البنود × 100، لذلك تتغير النتيجة حسب نطاق الفلاتر.</p></div>
        <div><strong>مستويات النضج</strong><p>أولي للنسب المنخفضة، جزئي للنطاق المتوسط، ومتقدم للنسب الأعلى وفق الحدود المعرفة في بيانات النموذج.</p></div>
      </section>
    </main>
  );
}
