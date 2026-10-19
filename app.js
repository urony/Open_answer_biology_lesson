"use strict";
/* ===================== מצב ושמירה ===================== */
const KEY = "process-answer-v1";
const STEPS = ["התחלה", "תרגיל ראשון", "לימוד", "תיקון", "השוואה", "תרגול", "משוב", "דוח"];

function freshState() {
  return {
    step: 0, max: 0, teacher: false, name: "",
    t1: { answer: "", start: 0, secs: 0, done: false },
    fix: { cause: "", result: "", steps: ["", "", ""], answer: "", start: 0, secs: 0, checked: false },
    refl: { g1: "", why1: "", missing: "", g2: "", change: "" },
    prac: { cause: "", result: "", steps: ["", "", ""], answer: "", start: 0, secs: 0, checked: false, grade: "", note: "" },
    lesson: { rating: 0, liked: "", improve: "", take: "" },
    phone: ""
  };
}
let S = freshState();
try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(freshState(), JSON.parse(raw)); } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

let learnTab = "why";
let pdfBlob = null, pdfBuilding = false;

/* ===================== עזרים ===================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function setPath(obj, path, val) {
  const p = path.split("."); let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = val;
}
const wordsOf = t => (t.match(/[א-ת]+/g) || []);
function fmtSecs(s) { const m = Math.floor(s / 60), r = s % 60; return m ? `${m} דקות ו-${r} שניות` : `${r} שניות`; }
function touchTimer(o) { if (!o.start) { o.start = Date.now(); save(); } }
function stopTimer(o) { if (o.start && !o.secs) o.secs = Math.max(1, Math.round((Date.now() - o.start) / 1000)); }

/* ===================== בודק לפי כללים ===================== */
const TELEO_WORDS = ["רוצה", "רוצים", "רוצות", "צריך", "צריכה", "צריכים", "צריכות", "מנסה", "מנסים", "מנסות", "מעוניין", "מעוניינים", "כדי", "בכדי"];
const CONNECT = /כתוצאה מ|גורם|גורמת|גורמים|יגרום|תגרום|מביא|מביאה|יביא|תביא|מוביל|מובילה|יוביל|תוביל|לכן|ולכן|עקב|בשל|כך ש|וכך|הדבר גורם|כך ש/g;
const DIRECTION = ["ירידה", "יורד", "ירד", "תרד", "ירדה", "עלייה", "עליה", "עולה", "יעלה", "תעלה", "פוחת", "פחות", "יפחת", "תפחת", "גדל", "גדלה", "יגדל", "קטן", "קטנה", "יקטן", "תקטן", "הקטנת", "הקטנה", "הפחתת", "מקטין", "מעלה", "מוריד", "יותר", "מצטמצם", "מוגבר", "מופחת", "מחסור", "מועט", "מגדיל", "מגביר", "מפחית"];
const LEVELS = [
  { n: "אטומים/מולקולות", re: /חמצן|פחמן|CO|המוגלובין|ATP|גלוקוז|מולקול|אטום|יון|גז/ },
  { n: "אברונים/תאים", re: /תא|תאי|תאים|מיטוכונדר|אברונ|אריתרוציט|קרום/ },
  { n: "רקמות", re: /רקמ|שריר|אפיתל|נימ|דם/ },
  { n: "איברים", re: /ריאה|ריאות|ריאה|לב|חדר|עלי|נאדי|כליה|כבד|מוח|עורק|וריד|איבר/ },
  { n: "מערכת איברים", re: /מערכת|מחזור/ },
  { n: "אורגניזם", re: /גוף|אדם|תינוק|חולה|מעשן|אורגניזם|פעילות גופנית|מתאמץ/ }
];

function findTeleo(text) {
  const found = [];
  const re = /[א-ת]+/g; let m;
  while ((m = re.exec(text))) {
    const w = m[0];
    for (const t of TELEO_WORDS) {
      if (w === t || w.slice(1) === t || w.slice(2) === t) { found.push(w); break; }
    }
  }
  if (/על מנת/.test(text)) found.push("על מנת");
  return [...new Set(found)];
}
function highlight(text, bad) {
  let h = esc(text);
  bad.forEach(b => { h = h.split(esc(b)).join(`<mark>${esc(b)}</mark>`); });
  return h.replace(/\n/g, "<br>");
}

/* מחזיר { items:[{status:'ok'|'warn'|'bad', title, tip}], passed, total, teleo } */
function analyze(text, qKey, chain) {
  const q = QUESTIONS[qKey];
  const items = [];
  const clean = (text || "").trim();
  const words = wordsOf(clean);
  const add = (status, title, tip) => items.push({ status, title, tip: tip || "" });

  // 1. הסבר מספק ולא חזרה על השאלה
  const qWords = new Set(wordsOf(q.text).filter(w => w.length > 2));
  const content = words.filter(w => w.length > 2);
  const fromQ = content.filter(w => qWords.has(w)).length;
  const newRatio = content.length ? 1 - fromQ / content.length : 0;
  if (words.length < 25) add("bad", "התשובה קצרה מדי להסבר", "הסבר תהליכי מורכב משרשרת של כמה שלבים. כתבו לפחות כמה משפטים שמחברים בין הסיבה לתוצאה.");
  else if (newRatio < 0.35) add("warn", "רוב התשובה חוזרת על מילות השאלה", "הוסיפו ידע חדש: מה קורה בדרך בין הסיבה לתוצאה? אל תחזרו על השאלה במילים אחרות.");
  else add("ok", "יש הסבר ולא רק חזרה על השאלה");

  // 2. ניסוח תכליתי / האנשה
  const teleo = findTeleo(clean);
  if (teleo.length) add("bad", "יש ניסוח תכליתי או האנשה: " + teleo.join(", "), "בביולוגיה מתארים מנגנון: דבר גורם לדבר. אל תכתבו שהתאים \"רוצים\" או \"צריכים\" ובלי \"על מנת\" ו\"בכדי\". למשל: \"ירידה בחמצן גורמת לירידה בנשימה תאית\".");
  else add("ok", "ניסוח מנגנוני, בלי תכליתיות ובלי האנשה");

  // 3. מילות קישור סיבתיות
  const conn = (clean.match(CONNECT) || []).length;
  if (conn >= 3) add("ok", "יש קישורים סיבתיים בין השלבים (" + conn + ")");
  else add(conn ? "warn" : "bad", "מעט קישורים סיבתיים בין השלבים", "הוסיפו \"כתוצאה מכך\", \"גורם ל…\", \"כך ש…\" בין כל שני שלבים, כדי שיהיה ברור איזה דבר מוביל לאיזה דבר.");

  // 4. כיווניות
  const dirFound = new Set();
  words.forEach(w => DIRECTION.forEach(d => { if (w === d || w.slice(1) === d || w.slice(2) === d) dirFound.add(d); }));
  if (dirFound.size >= 2) add("ok", "יש כיווניות (עלייה / ירידה / הפחתה)");
  else add("warn", "חסרה כיווניות בתהליך", "ציינו בכל שלב אם משהו עולה, יורד, גדל או קטן (למשל \"ריכוז החמצן ירד\").");

  // 5. רמות ארגון
  const lv = LEVELS.filter(l => l.re.test(clean));
  if (lv.length >= 3) add("ok", "התייחסות לכמה רמות ארגון: " + lv.map(l => l.n).join(", "));
  else if (lv.length === 2) add("ok", "התייחסות לשתי רמות ארגון: " + lv.map(l => l.n).join(", "), "אפשר להוסיף עוד רמה אחת כדי להעמיק.");
  else add("warn", "התייחסות לרמת ארגון אחת בלבד", "נסו לעבור בין רמות: מולקולה (חמצן, המוגלובין), תא, רקמה, איבר ואורגניזם.");

  // 6. מושגי מפתח
  const missing = q.concepts.filter(c => !c.all.every(r => r.test(clean)));
  if (!missing.length) add("ok", "כל מושגי המפתח מופיעים");
  else add(missing.length > 2 ? "bad" : "warn", "ייתכן שחסרים בתהליך: " + missing.map(m => m.name).join("; "), "בדקו אם התהליך שלכם קופץ על שלב. הבדיקה מזהה מילים, אז אם כתבתם את הרעיון במילים אחרות זה בסדר, אבל ודאו שהוא אכן שם.");

  // 7. שרשור (רק כשיש תבנית)
  if (chain) {
    const nodes = [chain.cause, ...chain.steps, chain.result].filter(s => s && s.trim());
    if (nodes.length >= 5) add("ok", "שרשור נסיבתי של " + nodes.length + " חוליות");
    else add("warn", "שרשור קצר: " + nodes.length + " חוליות", "הוסיפו חוליות בין הסיבה לתוצאה. אל תדלגו על שלבים.");
  }
  if (/→|←|↓/.test(clean)) add("bad", "נשארו חיצים בטקסט", "החליפו כל חץ ב\"כתוצאה מכך\" או \"גורם ל\".");

  const passed = items.filter(i => i.status === "ok").length;
  return { items, passed, total: items.length, teleo };
}
function scoreClass(a) { const r = a.passed / a.total; return r >= 0.8 ? "" : r >= 0.5 ? "mid" : "low"; }
function critHTML(a) {
  const ic = { ok: "✓", warn: "!", bad: "✗" };
  return `<ul class="crit">${a.items.map(i => `<li class="${i.status}"><span class="ic">${ic[i.status]}</span><span class="t">${esc(i.title)}${i.tip ? `<small>${esc(i.tip)}</small>` : ""}</span></li>`).join("")}</ul>`;
}

/* ===================== תוכן הלימוד ===================== */
function chainView(arr) {
  return `<div class="chain">${arr.map((s, i) => `${i ? '<div class="arrow">↓</div>' : ""}<div class="node"><input type="text" value="${esc(s)}" readonly></div>`).join("")}</div>`;
}
function learnHTML(tab) {
  const tabs = `<div class="tabs">${LEARN_TABS.map(t => `<button data-act="ltab:${t.id}" class="${t.id === tab ? "cur" : ""}">${t.label}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "why") body = `
    <h2>בביולוגיה מסבירים מנגנון</h2>
    <p>לא משננים. מבינים את המנגנונים והתהליכים ומספרים את הסיפור של המכונה שנקראת חיים.</p>
    <ul>
      <li><b>חשיבה מנגנונית ולא תכליתית.</b> מתארים איך דבר אחד גורם לדבר אחר, ולא בשביל מה הוא קורה.</li>
      <li><b>לא מאנישים.</b> תא, איבר או רקמה לא \"רוצים\" ולא \"צריכים\". הם עוברים תהליך או פועלים. כתבו בשפה פסיבית ותהליכית, בלי: \"על מנת…\", \"בכדי…\", \"רוצה…\", \"צריך…\".</li>
      <li><b>הסבר ולא חזרה על השאלה.</b> תשובה מלאה מתארת תהליך: שרשרת של שלבים. אל תחזרו על נאמר בשאלה במילים אחרות.</li>
      <li><b>כתבו חד וברור.</b> הוסיפו ידע מעבר לנאמר בשאלה, אבל רק תוכן רלוונטי.</li>
    </ul>`;
  if (tab === "bad") body = `
    <h2>דוגמאות לתשובות לקויות</h2>
    <div class="q">${esc(SEPTUM.q)}</div>
    <h3>דוגמה א: אין הסבר</h3>
    <div class="bad-ex">${esc(SEPTUM.bad1)}</div>
    <p>זו חזרה על התופעה. אין כאן תיאור תהליך: מה קורה בעקבות הערבוב ולמה זה מסוכן.</p>
    <h3>דוגמה ב: ניסוח תכליתי ומואנש</h3>
    <div class="bad-ex">${esc(SEPTUM.bad2)}</div>
    <p>הבעיות: \"על מנת\", \"בכדי\", \"התאים רוצים\", \"הם צריכים\". אלה מתארים כוונה ולא מנגנון.</p>`;
  if (tab === "steps") body = `
    <h2>ארבעה שלבים לבניית תשובה</h2>
    <div class="q">${esc(SEPTUM.q)}</div>
    <h3>א. מזהים סיבה ותוצאה</h3>
    <p>מה שהתרחש קודם הוא הסיבה, ומה שהתרחש אחר כך הוא התוצאה. כאן: <b>סיבה</b> = המחיצה בין החדרים לא נסגרה. <b>תוצאה</b> = סכנה לתינוק.</p>
    <h3>ב. יוצרים תבנית</h3>
    <p>הסיבה בתחילת התבנית, התוצאה בסופה, ובאמצע רווח להשלמה.</p>
    <h3>ג. בונים שרשור נסיבתי</h3>
    <p>רצף תהליכים עוקבים בזמן, מהסיבה אל התוצאה, בלי לדלג על שלבים. בין כל שני שלבים \"גורם ל\". כוללים מושגים ועקרונות ביולוגיים ולפחות כמה רמות ארגון, ומקפידים על כיווניות (מעלה / מוריד / מוסיף / גורע).</p>
    ${chainView(SEPTUM.chain)}
    <h3>ד. כותבים את התשובה</h3>
    <p>קוראים את השרשור באופן ביקורתי ומחליפים כל חץ ב\"כתוצאה מכך\" או \"גורם ל\". התשובה צריכה להיות זורמת, הגיונית ומובנת. אם היא לא זורמת, בדקו שלא קפצתם קדימה ואחורה בציר הזמן.</p>
    <div class="good-ex">${esc(SEPTUM.good)}</div>
    <p class="muted">התשובה מתארת שרשרת אירועים שבה דבר מוביל לדבר, ומתייחסת לרמת האיבר, הרקמה, התא והמולקולה.</p>`;
  if (tab === "levels") body = `
    <h2>רמות ארגון</h2>
    <p>כשעונים על שאלה שיש בה תהליך, כדאי להשתמש לפחות בשתיים או שלוש רמות ארגון. רשמו בצד את הרמות ובדקו שהתייחסתם ל-2 עד 3 מהן.</p>
    <p>דוגמה במערכת הנשימה: אטומים (חמצן), מולקולות (המוגלובין), רקמה (נאדיות), איבר (ריאות), אורגניזם (מאפיין חיים שלו), אוכלוסייה (בעלי חיים וצמחים).</p>
    <div class="tabs">${ORG_LEVELS.map(l => `<span style="border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 12px;font-size:15px">${l}</span>`).join("")}</div>`;
  if (tab === "missing") body = `
    <h2>כשחסרה סיבה או תוצאה</h2>
    <div class="q">מספר הנאדיות בריאה הוא עצום (מעל 300 מיליון). הסבירו מדוע.</div>
    <p>לעיתים בשאלה עצמה נתונה רק הסיבה או רק התוצאה. אז:</p>
    <ol>
      <li>משלימים את החסר מתוך הידע שלנו.</li>
      <li>מחפשים את הסיבה <b>הראשונית ביותר</b> או את התוצאה <b>הסופית ביותר</b>, ולא נקודה שנמצאת באמצע התהליך.</li>
    </ol>
    <div class="good-ex"><b>כלל אצבע:</b><br>אם שואלים <b>מדוע</b> משהו קורה, שואלים על הסיבה, ולכן מה שנתון הוא התוצאה.<br>אם שואלים <b>למה משהו גורם</b> (או מה עלול לקרות), שואלים על התוצאה, ולכן מה שנתון הוא הסיבה.</div>
    <p>כאן נתונה התוצאה (מספר נאדיות עצום), ולכן משלימים אחורה: מעבר הגזים נעשה דרך קרום הנאדיות ← יחס שטח פנים לנפח גדול ← מספר הנאדיות עצום.</p>
    <p class="muted">בשאלת התרגול האחרונה (דלקת ריאות) תצטרכו להשלים תוצאה סופית.</p>`;
  const idx = LEARN_TABS.findIndex(t => t.id === tab);
  const nav = `<div class="row">
    ${idx > 0 ? `<button class="btn sec" data-act="ltab:${LEARN_TABS[idx - 1].id}">הקודם</button>` : ""}
    ${idx < LEARN_TABS.length - 1 ? `<button class="btn" data-act="ltab:${LEARN_TABS[idx + 1].id}">הבא</button>` : ""}
  </div>`;
  return tabs + `<div class="card">${body}${nav}</div>`;
}

/* ===================== רכיבי ממשק משותפים ===================== */
function howBox(inner) { return `<details class="how"><summary>פירוט: מה עושים בשלב הזה?</summary>${inner}</details>`; }
function learnLink() { return `<button class="link" data-act="learn">📘 ללימוד (חוזרים לכאן אחרי)</button>`; }
function gradeSelect(path, val) {
  return `<select data-p="${path}"><option value="">בחרו ציון</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${String(val) === String(n) ? "selected" : ""}>${n}</option>`).join("")}</select>`;
}
function chainEditor(key) {
  const o = S[key];
  const nodes = o.steps.map((s, i) => `
    <div class="arrow">↓</div>
    <div class="node"><span class="tag">שלב ${i + 1}</span><input type="text" data-p="${key}.steps.${i}" value="${esc(s)}" placeholder="מה קורה בשלב הזה?">
    <button class="x" data-act="delstep:${key}:${i}" aria-label="מחיקת שלב">✕</button></div>`).join("");
  return `<div class="chain">
    <div class="node"><span class="tag">סיבה</span><input type="text" data-p="${key}.cause" value="${esc(o.cause)}" placeholder="הסיבה (מה שקרה קודם)"></div>
    ${nodes}
    <div class="arrow">↓</div>
    <div class="node"><span class="tag">תוצאה</span><input type="text" data-p="${key}.result" value="${esc(o.result)}" placeholder="התוצאה (מה שקרה בסוף)"></div>
  </div>
  <div class="row"><button class="btn sec" data-act="addstep:${key}">+ הוספת שלב</button><button class="btn sec" data-act="draft:${key}">מלאו טיוטה מהשרשור</button></div>`;
}
function modelBox(q) {
  return `<div class="model"><b>שרשור לדוגמה</b><ol>${q.modelChain.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
  <b>תשובה לדוגמה</b><p>${esc(q.modelAnswer)}</p></div>`;
}

/* ===================== שלבים ===================== */
const R = {};
R[0] = () => `
  <div class="card">
    <h2>ברוכים הבאים</h2>
    <p>בכלי הזה נתרגל כתיבה של הסבר תהליכי בביולוגיה. התהליך:</p>
    <ol>
      <li>כותבים תשובה לשאלה, כמו שאתם רגילים.</li>
      <li>לומדים את שיטת השרשור הנסיבתי.</li>
      <li>מתקנים את התשובה ומקבלים משוב מהמערכת.</li>
      <li>מתרגלים שאלה נוספת.</li>
      <li>מורידים דוח ושולחים למורה בוואטסאפ.</li>
    </ol>
    ${howBox(`<ul><li>הכלי מלווה שיעור, אבל אפשר ללמוד גם לבד.</li><li>בכל שלב יש כפתור כזה של \"פירוט\" ולעיתים גם קישור \"ללימוד\" שמחזיר אתכם בחזרה.</li><li>ההתקדמות נשמרת במכשיר, אפשר לסגור ולחזור.</li></ul>`)}
    <label for="nm">שם מלא</label>
    <input id="nm" type="text" data-p="name" value="${esc(S.name)}" placeholder="השם שלכם" autocomplete="name">
    <div class="row"><button class="btn" data-act="go:1" ${S.name.trim() ? "" : "disabled"} id="startBtn">מתחילים</button></div>
  </div>`;

R[1] = () => {
  const q = QUESTIONS.co, t = S.t1;
  return `<div class="card">
    <h2>תרגיל ראשון</h2>
    ${howBox(`<ol><li>קראו את השאלה.</li><li>כתבו תשובה במחברת או כאן, כמו שאתם רגילים.</li><li>עונים ברצינות. הזמן נמדד.</li><li>לחצו \"סיימתי\". אחרי זה <b>לא ניתן לתקן</b>, וזה חשוב.</li></ol>`)}
    <div class="q">${esc(q.text)}</div>
    <textarea data-p="t1.answer" ${t.done ? "readonly" : ""} placeholder="כתבו כאן את התשובה">${esc(t.answer)}</textarea>
    ${t.done
      ? `<p class="timer">התשובה נשמרה. זמן כתיבה: ${fmtSecs(t.secs)}. אין לתקן אותה.</p><div class="row"><button class="btn" data-act="go:2">ללימוד</button></div>`
      : `<p class="timer">הזמן מתחיל להימדד כשמתחילים לכתוב. תשאירו את התשובה כפי שכתבתם, בלי לתקן אחר כך.</p>
         <div class="row"><button class="btn" data-act="done1" id="done1" ${wordsOf(t.answer).length < 3 ? "disabled" : ""}>סיימתי</button></div>`}
  </div>`;
};

R[2] = () => `
  <div class="card"><h2>לימוד: איך כותבים תשובה</h2><p class="muted">עברו על הלשוניות לפי הסדר. אפשר לחזור לכאן בכל רגע.</p>${howBox(`<ul><li>עברו על 5 הלשוניות בסדר, בעזרת \"הבא\".</li><li>שימו לב לדוגמה של המחיצה בלב. בשלב הבא תיישמו אותה בעצמכם.</li></ul>`)}</div>
  ${learnHTML(learnTab)}
  <div class="row"><button class="btn" data-act="go:3">עברתי על הכול, לתיקון התשובה</button></div>`;

function practiceBlock(key, qKey, showFirst) {
  const o = S[key], q = QUESTIONS[qKey];
  const chain = { cause: o.cause, steps: o.steps, result: o.result };
  let fb = "";
  if (o.checked) {
    const a = analyze(o.answer, qKey, chain);
    fb = `<div class="card"><h3>משוב מהמערכת <span class="score ${scoreClass(a)}">${a.passed} מתוך ${a.total}</span></h3>
      ${a.teleo.length ? `<p>הניסוחים שסומנו בתשובה שלכם:</p><div class="box" style="background:#fff7f6;border-radius:10px;padding:8px 12px">${highlight(o.answer, a.teleo)}</div>` : ""}
      ${critHTML(a)}
      <p class="muted">הבדיקה אוטומטית ועובדת לפי כללים ומילות מפתח, ולכן היא עלולה לטעות. שימו לב לנימוקים ושפטו בעצמכם.</p>
      <b>דוגמה להשוואה</b>${modelBox(q)}</div>`;
  }
  return `<div class="card">
    <div class="q">${esc(q.text)}</div>
    ${q.hint ? `<p class="muted">${esc(q.hint)}</p>` : ""}
    ${showFirst ? `<details class="how" style="background:#eef3ff;border-color:#cfdcf5"><summary style="color:#2b4a8a">התשובה הראשונה שלי (לעיון)</summary><p>${esc(S.t1.answer).replace(/\n/g, "<br>")}</p></details>` : ""}
    <h3>שלבים א ו-ב: תכנון השרשור</h3>
    <p class="muted">זהו סיבה ותוצאה, ומלאו את השלבים שביניהם. כתבו בכל חוליה רעיון אחד.</p>
    ${chainEditor(key)}
    <h3>שלב ד: כתיבת התשובה</h3>
    <p class="muted">החליפו כל חץ ב\"כתוצאה מכך\" או \"גורם ל\", ושימו לב לכיווניות ולרמות ארגון.</p>
    <textarea data-p="${key}.answer" placeholder="כתבו כאן את התשובה המלאה">${esc(o.answer)}</textarea>
    <div class="row"><button class="btn" data-act="check:${key}:${qKey}" ${wordsOf(o.answer).length < 5 ? "disabled" : ""} id="chk_${key}">בדיקת התשובה</button></div>
    ${o.checked && o.secs ? `<p class="timer">זמן כתיבה עד הבדיקה הראשונה: ${fmtSecs(o.secs)}</p>` : ""}
  </div>${fb}`;
}

R[3] = () => `
  <div class="card"><h2>תיקון: שאלת ה-CO</h2>
    ${howBox(`<ol><li>מצאו בשאלה את הסיבה ואת התוצאה.</li><li>בנו שרשור: כתבו את החוליות שביניהן, בלי לדלג.</li><li>לחצו \"מלאו טיוטה\" וערכו אותה לתשובה זורמת.</li><li>לחצו \"בדיקת התשובה\" וקראו את המשוב.</li></ol>`)}
    ${learnLink()}
    <p class="muted">גם הפעם נמדד הזמן.</p></div>
  ${practiceBlock("fix", "co", true)}
  ${S.fix.checked ? `<div class="row"><button class="btn" data-act="go:4">להשוואה ורפלקציה</button></div>` : ""}`;

R[4] = () => {
  const a1 = analyze(S.t1.answer, "co", null), a2 = analyze(S.fix.answer, "co", { cause: S.fix.cause, steps: S.fix.steps, result: S.fix.result });
  const r = S.refl;
  return `<div class="card"><h2>השוואה ורפלקציה</h2>
    ${howBox(`<ol><li>קראו את שתי התשובות.</li><li>תנו לעצמכם ציון בכנות ונמקו.</li><li>כתבו מה השתנה ומה חסר לכם בתשובה הראשונה.</li></ol>`)}
    <div class="cols">
      <div><h3>התשובה הראשונה <span class="score ${scoreClass(a1)}">${a1.passed}/${a1.total}</span></h3><div class="box" style="border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:#fff">${highlight(S.t1.answer, a1.teleo)}</div></div>
      <div><h3>התשובה המתוקנת <span class="score ${scoreClass(a2)}">${a2.passed}/${a2.total}</span></h3><div class="box" style="border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:#fff">${highlight(S.fix.answer, a2.teleo)}</div></div>
    </div>
    <label>איזה ציון מ-1 עד 10 הייתם נותנים לתשובה הראשונה?</label>${gradeSelect("refl.g1", r.g1)}
    <label>נמקו</label><textarea style="min-height:80px" data-p="refl.why1">${esc(r.why1)}</textarea>
    <label>אם החסרתם דבר מה בתהליך: מה החסרתם ומדוע לדעתכם?</label><textarea style="min-height:80px" data-p="refl.missing">${esc(r.missing)}</textarea>
    <label>איזה ציון הייתם נותנים לתשובה המתוקנת?</label>${gradeSelect("refl.g2", r.g2)}
    <label>האם חל שינוי בין התשובות? פרטו מה השינוי לטעמכם.</label><textarea style="min-height:80px" data-p="refl.change">${esc(r.change)}</textarea>
    <div class="row"><button class="btn" data-act="go:5" ${r.g1 && r.g2 ? "" : "disabled"} id="go5">לשאלת התרגול</button></div>
  </div>`;
};

R[5] = () => `
  <div class="card"><h2>תרגול: דלקת ריאות</h2>
    ${howBox(`<ol><li>שימו לב מה נתון בשאלה, סיבה או תוצאה, ומה צריך להשלים.</li><li>בנו שרשור, כתבו תשובה ולחצו \"בדיקת התשובה\".</li><li>בסוף תנו לעצמכם ציון.</li></ol>`)}
    ${learnLink()}</div>
  ${practiceBlock("prac", "pneu", false)}
  ${S.prac.checked ? `<div class="card">
    <label>איזה ציון מ-1 עד 10 הייתם נותנים לתשובה שלכם?</label>${gradeSelect("prac.grade", S.prac.grade)}
    <label>מה עשיתם טוב, ומה אפשר לשפר?</label><textarea style="min-height:80px" data-p="prac.note">${esc(S.prac.note)}</textarea>
    <div class="row"><button class="btn" data-act="go:6" ${S.prac.grade ? "" : "disabled"} id="go6">להמשך</button></div></div>` : ""}`;

R[6] = () => {
  const l = S.lesson;
  const emojis = ["😞", "😕", "😐", "🙂", "😀"];
  return `<div class="card"><h2>משוב על השיעור</h2>
    ${howBox(`<p>הדרגה והמשוב שלכם עוזרים למורה לשפר את השיעור. הם יופיעו בדוח.</p>`)}
    <label>איך היה השיעור?</label>
    <div class="rate">${emojis.map((e, i) => `<button data-act="rate:${i + 1}" class="${l.rating === i + 1 ? "on" : ""}" aria-label="דירוג ${i + 1}">${e}</button>`).join("")}</div>
    <label>מה עזר לכם?</label><textarea style="min-height:70px" data-p="lesson.liked">${esc(l.liked)}</textarea>
    <label>מה אפשר לשפר בשיעור?</label><textarea style="min-height:70px" data-p="lesson.improve">${esc(l.improve)}</textarea>
    <label>מה אני לוקח מהשיעור לכתיבת תשובות בעתיד?</label><textarea style="min-height:70px" data-p="lesson.take">${esc(l.take)}</textarea>
    <div class="row"><button class="btn" data-act="go:7" ${l.rating ? "" : "disabled"} id="go7">ליצירת הדוח</button></div></div>`;
};

R[7] = () => `
  <div class="card"><h2>הדוח למורה</h2>
    ${howBox(`<ol><li>המתינו עד שהדוח מוכן.</li><li>לחצו \"שליחה בוואטסאפ\". בטלפון ייפתח חלון שיתוף עם קובץ ה-PDF.</li><li>במחשב: הורידו את הקובץ וצרפו אותו לשיחה בוואטסאפ ווב.</li></ol>`)}
    <p>שם: <b>${esc(S.name)}</b></p>
    <p id="pdfState" class="muted">${pdfBlob ? "הדוח מוכן ✓" : "מכינים את הדוח…"}</p>
    ${TEACHER_PHONE ? "" : `<label>מספר וואטסאפ של המורה (לא חובה, בפורמט 972501234567)</label><input type="text" inputmode="numeric" data-p="phone" value="${esc(S.phone)}">`}
    <div class="row">
      <button class="btn wa" data-act="share" id="shareBtn" ${pdfBlob ? "" : "disabled"}>שליחה בוואטסאפ</button>
      <button class="btn sec" data-act="dl" id="dlBtn" ${pdfBlob ? "" : "disabled"}>הורדת PDF</button>
    </div>
  </div>`;

/* ===================== דוח PDF ===================== */
function reportHTML() {
  const a1 = analyze(S.t1.answer, "co", null);
  const a2 = analyze(S.fix.answer, "co", { cause: S.fix.cause, steps: S.fix.steps, result: S.fix.result });
  const a3 = analyze(S.prac.answer, "pneu", { cause: S.prac.cause, steps: S.prac.steps, result: S.prac.result });
  const crit = a => `<ul>${a.items.map(i => `<li>${{ ok: "✓", warn: "!", bad: "✗" }[i.status]} ${esc(i.title)}</li>`).join("")}</ul>`;
  const chainTxt = o => [o.cause, ...o.steps, o.result].filter(s => s.trim()).map(esc).join(" ← ");
  const rating = ["", "😞", "😕", "😐", "🙂", "😀"][S.lesson.rating] || "";
  const d = new Date().toLocaleDateString("he-IL");
  const blocks = [
    `<h1>דוח תרגול: כתיבת תשובה תהליכית</h1><p class="meta">שם: <b>${esc(S.name)}</b> | תאריך: ${d}</p>`,
    `<h2>1. התשובה הראשונה (שאלת ה-CO) <span class="pill">${a1.passed}/${a1.total}</span></h2><div class="box">${highlightPlain(S.t1.answer)}</div><p class="meta">זמן כתיבה: ${fmtSecs(S.t1.secs || 0)}</p>${crit(a1)}`,
    `<h2>2. התשובה המתוקנת (שאלת ה-CO) <span class="pill">${a2.passed}/${a2.total}</span></h2><p class="meta">שרשור: ${chainTxt(S.fix)}</p><div class="box">${highlightPlain(S.fix.answer)}</div><p class="meta">זמן כתיבה: ${fmtSecs(S.fix.secs || 0)}</p>${crit(a2)}`,
    `<h2>3. הערכה עצמית והשוואה</h2><p>ציון לתשובה הראשונה: <b>${esc(S.refl.g1)}</b>. נימוק: ${esc(S.refl.why1)}</p><p>מה חסר בתשובה הראשונה: ${esc(S.refl.missing)}</p><p>ציון לתשובה המתוקנת: <b>${esc(S.refl.g2)}</b></p><p>מה השתנה: ${esc(S.refl.change)}</p>`,
    `<h2>4. שאלת התרגול (דלקת ריאות) <span class="pill">${a3.passed}/${a3.total}</span></h2><p class="meta">שרשור: ${chainTxt(S.prac)}</p><div class="box">${highlightPlain(S.prac.answer)}</div>${crit(a3)}<p>ציון עצמי: <b>${esc(S.prac.grade)}</b>. רפלקציה: ${esc(S.prac.note)}</p>`,
    `<h2>5. משוב למורה על השיעור</h2><p>דירוג: ${rating} (${S.lesson.rating}/5)</p><p>מה עזר: ${esc(S.lesson.liked)}</p><p>מה לשפר: ${esc(S.lesson.improve)}</p><p>מה אני לוקח: ${esc(S.lesson.take)}</p>`
  ];
  return `<div class="rdoc">${blocks.map(b => `<div class="rblock">${b}</div>`).join("")}</div>`;
}
function highlightPlain(t) { return esc(t).replace(/\n/g, "<br>"); }

async function buildPdf() {
  if (pdfBuilding) return;
  pdfBlob = null; pdfBuilding = true;
  const state = () => $("#pdfState");
  try {
    if (!window.html2canvas || !window.jspdf) throw new Error("חסרות ספריות (אין חיבור לאינטרנט?)");
    const host = $("#pdfHost"); host.innerHTML = reportHTML();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const W = 190, maxY = 285; let y = 8;
    for (const blk of host.querySelectorAll(".rblock")) {
      const c = await html2canvas(blk, { scale: 2, backgroundColor: "#ffffff" });
      let h = c.height * W / c.width;
      if (y + h > maxY && y > 8) { pdf.addPage(); y = 8; }
      let w = W; if (h > maxY - 8) { const k = (maxY - 8) / h; h *= k; w *= k; }
      pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 10, y, w, h);
      y += h + 2;
    }
    pdfBlob = pdf.output("blob");
    host.innerHTML = "";
    if (state()) state().textContent = "הדוח מוכן ✓";
    ["shareBtn", "dlBtn"].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = false; });
  } catch (e) {
    if (state()) state().textContent = "לא הצלחנו להכין את הדוח: " + e.message;
  }
  pdfBuilding = false;
}
function pdfFile() {
  const nm = (S.name || "תלמיד").replace(/[\\/:*?"<>|]/g, "").trim();
  return new File([pdfBlob], `דוח תשובה תהליכית - ${nm}.pdf`, { type: "application/pdf" });
}
function downloadPdf() {
  const f = pdfFile(); const u = URL.createObjectURL(f);
  const a = document.createElement("a"); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
async function sharePdf() {
  const f = pdfFile();
  const text = `שלום, זה הדוח שלי: תרגול כתיבת תשובה תהליכית (${S.name}).`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  downloadPdf();
  const phone = (TEACHER_PHONE || S.phone || "").replace(/\D/g, "");
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text + " (הקובץ ירד למכשיר, צרפו אותו להודעה)")}`, "_blank");
}

/* ===================== תצוגה ===================== */
function renderStepper() {
  $("#stepper").innerHTML = STEPS.map((n, i) => {
    const ok = S.teacher || i <= S.max;
    return `<button data-act="go:${i}" class="${i === S.step ? "cur" : i < S.step ? "done" : ""}" ${ok ? "" : "disabled"}>${i + 1}. ${n}</button>`;
  }).join("");
}
function render(keepScroll) {
  renderStepper();
  const y = window.scrollY;
  $("#app").innerHTML = R[S.step]();
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  if (S.step === 7) buildPdf();
}
function go(n) {
  S.step = n; if (n > S.max) S.max = n; save(); render();
}
function advance(n) { S.max = Math.max(S.max, n); go(n); }

/* ===================== אירועים ===================== */
document.addEventListener("input", e => {
  const p = e.target.dataset && e.target.dataset.p; if (!p) return;
  setPath(S, p, e.target.value);
  if (p === "t1.answer") { touchTimer(S.t1); const b = $("#done1"); if (b) b.disabled = wordsOf(S.t1.answer).length < 3; }
  if (p === "fix.answer" || p === "fix.cause" || p === "fix.result" || p.startsWith("fix.steps")) { touchTimer(S.fix); const b = $("#chk_fix"); if (b) b.disabled = wordsOf(S.fix.answer).length < 5; }
  if (p === "prac.answer" || p === "prac.cause" || p === "prac.result" || p.startsWith("prac.steps")) { touchTimer(S.prac); const b = $("#chk_prac"); if (b) b.disabled = wordsOf(S.prac.answer).length < 5; }
  if (p === "name") { const b = $("#startBtn"); if (b) b.disabled = !S.name.trim(); }
  save();
});
document.addEventListener("change", e => {
  const p = e.target.dataset && e.target.dataset.p; if (!p) return;
  if (p === "refl.g1" || p === "refl.g2") { const b = $("#go5"); if (b) b.disabled = !(S.refl.g1 && S.refl.g2); }
  if (p === "prac.grade") { const b = $("#go6"); if (b) b.disabled = !S.prac.grade; }
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const [act, a, b] = el.dataset.act.split(":");
  switch (act) {
    case "go": go(+a); break;
    case "done1": stopTimer(S.t1); S.t1.done = true; save(); render(true); break;
    case "ltab": learnTab = a; if ($("#overlay").hidden) render(true); else openLearn(); break;
    case "learn": openLearn(); break;
    case "closeLearn": $("#overlay").hidden = true; document.body.style.overflow = ""; break;
    case "addstep": S[a].steps.push(""); save(); render(true); break;
    case "delstep": if (S[a].steps.length > 1) { S[a].steps.splice(+b, 1); save(); render(true); } break;
    case "draft": {
      const o = S[a];
      const parts = [o.cause, ...o.steps, o.result].map(s => s.trim()).filter(Boolean);
      if (parts.length && !o.answer.trim()) { o.answer = parts.join(". כתוצאה מכך ") + "."; touchTimer(o); save(); render(true); }
      else if (parts.length) { if (confirm("יש כבר טקסט בתשובה. להחליף אותו בטיוטה?")) { o.answer = parts.join(". כתוצאה מכך ") + "."; save(); render(true); } }
      break;
    }
    case "check": { const o = S[a]; stopTimer(o); o.checked = true; save(); render(true); const f = $("#app .score"); if (f) f.scrollIntoView({ behavior: "smooth", block: "center" }); break; }
    case "rate": S.lesson.rating = +a; save(); render(true); break;
    case "dl": if (pdfBlob) downloadPdf(); break;
    case "share": if (pdfBlob) sharePdf(); break;
    case "teacher": S.teacher = !S.teacher; save(); renderStepper(); alert(S.teacher ? "מצב מורה: כל השלבים פתוחים." : "מצב מורה כבוי."); break;
    case "reset": if (confirm("למחוק את כל מה שנכתב ולהתחיל מחדש?")) { S = freshState(); pdfBlob = null; save(); render(); } break;
  }
});
function openLearn() {
  const o = $("#overlay");
  o.innerHTML = `<div class="sheet"><div class="row" style="margin:0 0 10px"><button class="btn" data-act="closeLearn">← חזרה לתרגיל</button></div>${learnHTML(learnTab)}<div class="row"><button class="btn" data-act="closeLearn">← חזרה לתרגיל</button></div></div>`;
  o.hidden = false; document.body.style.overflow = "hidden"; o.scrollTop = 0;
}

render();
