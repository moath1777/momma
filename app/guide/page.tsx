/* Native links match the navigation used by the Vinext app. */
/* eslint-disable @next/next/no-html-link-for-pages */
import styles from "./guide.module.css";
import AppHeader from "../components/app-header";

const contents = [
  ["start", "ابدأ التحليل"],
  ["results", "افهم النتائج"],
  ["checkpoints", "راجع نقاط التحقق"],
  ["data", "حدّث البيانات"],
  ["questions", "أسئلة شائعة"],
] as const;

export default function GuidePage() {
  return (
    <main className={styles.page}>
      <AppHeader active="guide" />

      <div className={styles.container} id="main-content">
        <section className={styles.hero} aria-labelledby="guide-title">
          <div>
            <p className={styles.eyebrow}>دليل استخدام لوحة قياس النضج</p>
            <h1 id="guide-title">من اختيار الوحدة<br />إلى فهم النتيجة.</h1>
            <p className={styles.intro}>تعرّف على نضج النموذج التشغيلي لوحدتك، قارن الأداء بالمستهدف، ثم انتقل إلى نقاط التحقق لمعرفة التفاصيل.</p>
            <div className={styles.actions}>
              <a className={styles.primary} href="/">افتح لوحة التحليل <span aria-hidden="true">←</span></a>
              <a className={styles.secondary} href="#start">تعرّف على الخطوات ↓</a>
            </div>
          </div>
          <aside className={styles.overview} aria-label="مراحل القياس الثلاث">
            <span className={styles.overviewLabel}>ما الذي تقيسه اللوحة؟</span>
            <div><b>01</b><p><strong>التصميم</strong><span>تأسيس النموذج التشغيلي وتحديد مكوناته.</span></p></div>
            <div><b>02</b><p><strong>البناء المؤسسي</strong><span>تجهيز المتطلبات والقدرات اللازمة للتطبيق.</span></p></div>
            <div><b>03</b><p><strong>التشغيل</strong><span>تطبيق النموذج ومتابعة تنفيذه.</span></p></div>
          </aside>
        </section>

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <nav aria-label="محتويات الدليل">
              <p>في هذا الدليل</p>
              {contents.map(([id, label], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{label}</a>)}
            </nav>
            <div className={styles.sideNote}><strong>ابدأ بالنطاق الصحيح</strong><p>راجع اسم «النطاق المحدد» أعلى اللوحة قبل قراءة أي نتيجة.</p></div>
          </aside>

          <div className={styles.sections}>
            <section id="start" className={styles.section} aria-labelledby="start-title">
              <div className={styles.sectionHeading}><span>01</span><div><p>اختيار نطاق التحليل</p><h2 id="start-title">اختر المجموعة، ثم الوحدة</h2></div></div>
              <ol className={styles.steps}>
                <li><span>1</span><div><h3>ابدأ بمستوى الوزارة أو إحدى مجموعاتها</h3><p>بطاقة «مستوى الوزارة» في الأعلى تعرض المتوسط العام للمجموعات الثلاث. تحتها يمكنك اختيار المرتبطة بسمو الوزير، أو الشؤون التنفيذية، أو الجهاز العسكري لاستكشاف هيكل المجموعة.</p></div></li>
                <li><span>2</span><div><h3>اختر الوحدة من الهيكل أو القائمة</h3><p>اختر وحدة رئيسية من الهيكل لقراءة نتائج وحداتها التابعة، أو بدّل إلى «قائمة» لرؤية الوحدات واختيارها بسهولة.</p></div></li>
                <li><span>3</span><div><h3>تأكد من «النطاق المحدد»</h3><p>عند اختيار وحدة، تنتقل الصفحة إلى بطاقات المراحل وتضعها في منتصف الشاشة، ثم تبدأ حركة الأرقام بعد ربع ثانية من الوصول. عند اختيار المجموعة، تعرض اللوحة متوسط درجات وحداتها.</p></div></li>
              </ol>
              <div className={styles.tip}><strong>للمقارنة بين الوحدات</strong><p>اختر الوحدة الأولى واقرأ نتائجها، ثم اختر الوحدة الأخرى. تحقق من اسم النطاق في كل مرة.</p></div>
            </section>

            <section id="results" className={styles.section} aria-labelledby="results-title">
              <div className={styles.sectionHeading}><span>02</span><div><p>قراءة بطاقات المراحل</p><h2 id="results-title">ماذا تعني الأرقام؟</h2></div></div>
              <div className={styles.example}>
                <div className={styles.exampleCard}>
                  <span className={styles.exampleLabel}>مثال توضيحي · بيانات افتراضية</span>
                  <h3>التصميم</h3>
                  <div className={styles.ring}><strong dir="ltr">80<span>%</span></strong></div>
                  <div className={styles.exampleTarget}><span>مستهدف 2026 <b dir="ltr">93%</b></span><span>الفجوة <b>13 نقطة</b></span></div>
                  <span className={styles.maturityBadge}>مستوى النضج: متقدم</span>
                </div>
                <dl className={styles.definitions}>
                  <div><dt>النسبة الحالية · 80%</dt><dd>درجة المرحلة للنطاق الذي اخترته. الرقم داخل الدائرة يوضح المستوى الحالي.</dd></div>
                  <div><dt>مستهدف 2026 · 93%</dt><dd>الدرجة المطلوب الوصول إليها، وفق بيانات ملف القياس.</dd></div>
                  <div><dt>الفجوة · 13 نقطة</dt><dd>المستهدف ناقص النسبة الحالية. إذا تجاوزت النسبة المستهدف، تظهر عبارة «متجاوز بـ».</dd></div>
                </dl>
              </div>
              <p className={styles.footnote}>تُعرض النسب والفجوات بأعداد صحيحة بعد التقريب. تُحسب الفجوة من القيم الأصلية، لذلك قد يختلف طرح الرقمين المعروضين عنها بنقطة واحدة.</p>
              <h3 className={styles.subheading}>كيف تقرأ مستوى النضج؟</h3>
              <div className={styles.levels}>
                <div><span className={styles.redDot} /><strong>أولي</strong><p>ضمن النطاق الأدنى للقياس</p></div>
                <div><span className={styles.amberDot} /><strong>جزئي</strong><p>ضمن النطاق المتوسط للقياس</p></div>
                <div><span className={styles.greenDot} /><strong>متقدم</strong><p>ضمن النطاق الأعلى للقياس</p></div>
              </div>
              <p className={styles.footnote}>الحدود المعتمدة لكل مستوى تظهر في مفتاح «مستوى النضج» بجانب الهيكل التنظيمي. التصنيف يعتمد على النسبة الأصلية قبل التقريب.</p>
              <details className={styles.calculation}><summary>من أين تأتي درجة المرحلة؟</summary><p>تُقرأ درجة كل وحدة من ورقة «النتائج» في ملف Excel. عند وجود نقاط NA، تُعاد حساب المرحلة المتأثرة من النقاط القابلة للقياس فقط، وفق أوزان العناصر في ورقة «المرجع» إن توفرت. إذا شمل النطاق عدة وحدات، تُعرض المتوسطات الحسابية لدرجاتها الحالية ومستهدفاتها لكل مرحلة. على مستوى الوزارة، تُحسب نتيجة كل مجموعة أولًا، ثم يؤخذ متوسط نتائج المجموعات الثلاث بالتساوي، دون تقريب القيم أثناء الحساب.</p></details>
            </section>

            <section id="checkpoints" className={styles.section} aria-labelledby="checkpoints-title">
              <div className={styles.sectionHeading}><span>03</span><div><p>الانتقال إلى التفاصيل</p><h2 id="checkpoints-title">راجع نقاط التحقق لكل مرحلة</h2></div></div>
              <p className={styles.sectionIntro}>بعد اختيار وحدة رئيسية أو فرعية، اضغط «نقاط التحقق» أسفل بطاقة التصميم أو البناء المؤسسي أو التشغيل لفتح تفاصيلها.</p>
              <div className={styles.checkpointFlow}><span>اختر وحدة</span><b aria-hidden="true">←</b><span>افتح نقاط التحقق</span><b aria-hidden="true">←</b><span>ابحث وقارن النتائج</span></div>
              <ul className={styles.checklist}><li>تظهر النقاط مجمّعة حسب العنصر، مع رمز كل نقطة ووصفها والوحدة التابعة لها.</li><li>استخدم البحث أو زر «النقاط دون المستهدف» لتحديد مواضع التحسين، وقارن «الحالي» مع «مستهدف 2026».</li><li>راجع الملاحظات والجهة المزودة للبيانات عند توفرها، ثم أغلق النافذة بزر الإغلاق أو مفتاح Escape.</li></ul>
              <div className={styles.tip}><strong>نقطة لا تنطبق على الوحدة؟</strong><p>اكتب NA في عمود «نسبة إنجاز النقطة %» في ملف Excel. تظهر في التفاصيل بحالة «لا يقاس»، وتُستبعد من حساب الدرجة الحالية والمستهدفة ومن قائمة «النقاط دون المستهدف». إذا كانت جميع نقاط المرحلة NA، تظهر «—» بدل النسبة.</p></div>
              <div className={styles.tip}><strong>بطاقة المرحلة لا تفتح؟</strong><p>عند تحديد المجموعة كاملة، تعرض البطاقات ملخص النتائج فقط. اختر وحدة رئيسية أو فرعية من الهيكل أولًا.</p></div>
            </section>

            <section id="data" className={styles.section} aria-labelledby="data-title">
              <div className={styles.sectionHeading}><span>04</span><div><p>تحديث مصدر القياس</p><h2 id="data-title">أبقِ بيانات اللوحة محدثة</h2></div></div>
              <p className={styles.sectionIntro}>استخدم «تنزيل البيانات» في لوحة التحليل للحصول على الملف الحالي، ثم عدّل بياناته مع الحفاظ على أسماء الأوراق والأعمدة المطلوبة.</p>
              <div className={styles.methods}>
                <article><span>تحديث عند الحاجة</span><h3>رفع ملف Excel</h3><ol><li>افتح صفحة «رفع البيانات».</li><li>اضغط «اختر ملف Excel» وحدد ملفًا بصيغة XLSX.</li><li>انتظر رسالة نجاح الرفع وتفعيل الإصدار، ثم ارجع إلى لوحة التحليل.</li></ol></article>
                <article><span>متابعة التعديلات تلقائيًا</span><h3>ربط الملف المحلي</h3><ol><li>من صفحة «رفع البيانات»، اضغط «ربط الملف».</li><li>اختر الملف واسمح للمتصفح بقراءته.</li><li>احفظ تعديلات Excel وأبقِ لوحة التحليل أو صفحة رفع البيانات مفتوحة للمزامنة.</li></ol></article>
              </div>
              <p className={styles.footnote}>لربط الملف المحلي استخدم Microsoft Edge أو Google Chrome. إذا طلب الموقع إعادة تأكيد الربط، اختر الملف مجددًا.</p>
              <div className={styles.tip}><strong>العودة إلى إصدار سابق</strong><p>من «إصدارات البيانات»، اضغط «استرجاع وتفعيل» بجانب الإصدار المطلوب. ستستخدم اللوحة بياناته بعد نجاح التفعيل.</p></div>
              <a href="/upload" className={styles.textLink}>افتح صفحة رفع البيانات وشروط الملف <span aria-hidden="true">←</span></a>
            </section>

            <section id="questions" className={styles.section} aria-labelledby="questions-title">
              <div className={styles.sectionHeading}><span>05</span><div><p>إجابات سريعة</p><h2 id="questions-title">عند الحاجة إلى مساعدة</h2></div></div>
              <div className={styles.faq}>
                <details><summary>لماذا تتغير النسب عند اختيار وحدة أخرى؟</summary><p>لأن البطاقات تعرض نتائج النطاق المحدد فقط. اختيار المجموعة يعرض متوسط وحداتها، واختيار وحدة يغيّر النتائج إلى بياناتها.</p></details>
                <details><summary>ماذا تعني علامة «—» بدل النسبة؟</summary><p>تعني عدم وجود درجة متاحة للمرحلة ضمن النطاق المحدد. راجع بيانات الوحدة في ملف القياس.</p></details>
                <details><summary>لماذا يرفض الموقع ملف Excel؟</summary><p>اقرأ رسالة الخطأ في صفحة رفع البيانات؛ فهي توضح المشكلة. تأكد من صيغة XLSX، وأسماء الأوراق والأعمدة المطلوبة، وأن نسب الإنجاز بين 0 و100. راجع «شروط ملف Excel» في الصفحة نفسها.</p></details>
                <details><summary>حفظت تعديلات Excel ولم تتغير النتائج، ماذا أفعل؟</summary><p>تأكد من أنك عدّلت الملف المرتبط نفسه، وأن الموقع مفتوح وحالة الربط متصلة. إذا تعذر الوصول للملف، أعد ربطه أو ارفعه يدويًا وانتظر رسالة النجاح.</p></details>
              </div>
            </section>
            <footer className={styles.footer}><div><strong>الآن، ابدأ بوحدتك.</strong><p>اختر نطاق التحليل وتعرّف على نتائج المراحل الثلاث.</p></div><a className={styles.primary} href="/">انتقل إلى لوحة التحليل <span aria-hidden="true">←</span></a></footer>
          </div>
        </div>
      </div>
    </main>
  );
}
