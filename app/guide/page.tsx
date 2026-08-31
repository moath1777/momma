const guideSections = [
  { number: "01", visual: "filters", title: "اختر المجموعة", text: "بدّل بين المرتبطة بسمو الوزير، الشؤون التنفيذية، والجهاز العسكري لعرض الهيكل التنظيمي الخاص بكل مجموعة." },
  { number: "02", visual: "details", title: "اختر العقدة", text: "اضغط على المجموعة أو الوحدة الرئيسية أو الفرعية داخل المخطط التنظيمي. تتحدث درجات المراحل الثلاث في أعلى الصفحة حسب النطاق المحدد." },
  { number: "03", visual: "stages", title: "قارن الحالي بالمستهدف", text: "تعرض كل مرحلة النسبة الحالية ومستهدف 2026 والفجوة بينهما. اضغط على المرحلة لعرض النسبتين لكل نقطة تحقق ضمن الوحدة المحددة." },
  { number: "04", visual: "upload", title: "حدّث ملف Excel", text: "ارفع الملف ذي الهيكل الجديد أو اربطه للمزامنة التلقائية. يتحقق الموقع من أوراق الوحدات والنتائج ونقاط التحقق قبل تفعيل الإصدار." },
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
            <div className={`guide-visual ${section.visual}`} role="img" aria-label={`صورة توضيحية: ${section.title}`}><b>{section.number}</b></div>
            <div className="guide-copy"><h2>{section.title}</h2><p>{section.text}</p></div>
          </article>
        ))}
      </section>

      <section className="guide-note">
        <div><strong>كيف تُحسب النسبة؟</strong><p>تُعرض درجة المرحلة المسجلة لكل وحدة في شيت «النتائج»، وعند اختيار عقدة تجمع عدة وحدات يعرض الموقع متوسط درجات الوحدات التابعة لها.</p></div>
        <div><strong>مستهدفات 2026</strong><p>يقرأ الموقع «درجة المرحلة المستهدفة لعام 2026» المحسوبة في Excel، ويعرضها بجانب الدرجة الحالية حسب العقدة المختارة.</p></div>
        <div><strong>مستويات النضج</strong><p>أولي للنسب المنخفضة، جزئي للنطاق المتوسط، ومتقدم للنسب الأعلى وفق الحدود المعرفة في بيانات النموذج.</p></div>
      </section>
    </main>
  );
}
