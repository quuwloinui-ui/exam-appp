"use strict";
// الشاشات. لا يوجد هنا اتصال مباشر بالخادم إلا عبر api() من api.js

var $ = function (s, r) { return (r || document).querySelector(s); };
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
var dtf = new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { timeZone: "Asia/Baghdad", dateStyle: "medium", timeStyle: "short" });
function fmt(d) { try { return dtf.format(new Date(d)); } catch (e) { return ""; } }
function num(x) { return x == null ? "-" : String(+(+x).toFixed(2)); }
function p2(n) { return (n < 10 ? "0" : "") + n; }
function fmtCd(ms) {
  var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? d + " يوم " + h + " ساعة" : h + ":" + p2(m) + ":" + p2(s % 60);
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

var app = $("#app"), rid = 0, ticker = null, unread = 0, toastT;

function applyTheme() {
  var t = Store.get("theme");
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
applyTheme();

function toast(m, bad) {
  var t = $("#toast"); t.textContent = m; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toastT); toastT = setTimeout(function () { t.className = ""; }, 3500);
}

var IC = {
  exams: '<path d="M8 3h8l3 3v15H5V3h3z"/><path d="M9 11h6M9 15h6"/>',
  bell: '<path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 004 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  queue: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>'
};
function ico(n) {
  return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + "</svg>";
}

function navItems() {
  var r = session.role;
  if (r === "student") return [["exams", "الامتحانات", "#/exams"], ["bell", "الإشعارات", "#/notifications"], ["user", "حسابي", "#/account"]];
  if (r === "examiner") return [["queue", "التصحيح", "#/queue"], ["user", "حسابي", "#/account"]];
  return [["home", "الرئيسية", "#/staff"], ["user", "حسابي", "#/account"]];
}
function isActive(href) {
  var k = href.split("/")[1], c = location.hash.split("/")[1] || "";
  return k === c || (k === "exams" && (c === "" || c === "exam")) || (k === "queue" && (c === "" || c === "grade")) || (k === "staff" && c === "");
}
function shell(title, body, back) {
  return '<header class="top">' + (back ? '<a class="back" href="' + back + '" aria-label="رجوع">' + ico("back") + "</a>" : "") + "<h1>" + esc(title) + "</h1></header>" +
    "<main>" + body + '</main><nav class="nav" aria-label="التنقل">' +
    navItems().map(function (i) {
      return '<a href="' + i[2] + '" class="' + (isActive(i[2]) ? "on" : "") + '">' + ico(i[0]) + "<span>" + i[1] + "</span>" +
        (i[0] === "bell" ? '<b class="dot" id="bdg"' + (unread ? "" : " hidden") + ">" + unread + "</b>" : "") + "</a>";
    }).join("") + "</nav>";
}
function paint(my, html) {
  if (my !== rid) return false;
  app.innerHTML = html; window.scrollTo(0, 0); return true;
}
function showError(e, my) {
  if (my !== rid) return;
  app.innerHTML = shell("تعذّر التحميل", '<div class="card stack"><p>' + esc(e && e.message ? e.message : "حدث خطأ") + '</p><button class="btn" id="rt">إعادة المحاولة</button></div>');
  $("#rt").onclick = route;
}
async function refreshUnread() {
  if (!session || session.role !== "student") return;
  try {
    var l = await api("/rest/v1/notifications?select=id&read_at=is.null&limit=99");
    unread = l.length; var b = $("#bdg");
    if (b) { b.textContent = unread; b.hidden = !unread; }
  } catch (e) {}
}
function startTicker() {
  clearInterval(ticker);
  var tick = function () {
    document.querySelectorAll(".cd[data-end]").forEach(function (el) {
      var ms = Date.parse(el.dataset.end) - nowMs();
      if (ms <= 0) { el.textContent = "انتهى الوقت"; el.removeAttribute("data-end"); setTimeout(route, 1500); return; }
      el.textContent = fmtCd(ms);
    });
  };
  tick(); ticker = setInterval(tick, 1000);
}

// ---------- الدخول ----------
function viewLogin() {
  var tab = "s";
  app.innerHTML =
    '<div class="login"><div class="brand"><img src="icon-192.png" alt="" width="64" height="64"><h1>منصة الامتحانات</h1><p>سجّل دخولك للمتابعة</p></div>' +
    '<div class="seg"><button type="button" class="on" data-t="s">طالب</button><button type="button" data-t="k">مدرس أو مصحح</button></div>' +
    '<form id="f" class="stack" autocomplete="off"><div id="fs" class="stack">' +
    '<label>الاسم الكامل<input id="n" autocomplete="name"></label>' +
    '<label>كود الدخول<input id="c" dir="ltr" autocapitalize="characters" autocomplete="off" spellcheck="false"></label></div>' +
    '<div id="fk" class="stack" hidden><label>البريد الإلكتروني<input id="e" type="email" dir="ltr" autocomplete="username"></label>' +
    '<label>كلمة المرور<input id="p" type="password" autocomplete="current-password"></label></div>' +
    '<p id="err" class="err" role="alert"></p><button class="btn full" id="go">دخول</button></form></div>';
  document.querySelectorAll(".seg button").forEach(function (b) {
    b.onclick = function () {
      tab = b.dataset.t;
      document.querySelectorAll(".seg button").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("#fs").hidden = tab !== "s"; $("#fk").hidden = tab !== "k"; $("#err").textContent = "";
    };
  });
  $("#f").onsubmit = async function (ev) {
    ev.preventDefault();
    var err = $("#err"), go = $("#go"); err.textContent = "";
    try {
      if (tab === "s") {
        if (!$("#n").value.trim() || !$("#c").value.trim()) { err.textContent = "اكتب الاسم الكامل وكود الدخول"; return; }
        go.disabled = true; go.textContent = "جارٍ الدخول…";
        await loginStudent($("#n").value, $("#c").value);
      } else {
        if (!$("#e").value.trim() || !$("#p").value) { err.textContent = "اكتب البريد وكلمة المرور"; return; }
        go.disabled = true; go.textContent = "جارٍ الدخول…";
        await loginStaff($("#e").value, $("#p").value);
      }
      unread = 0; history.replaceState(null, "", location.pathname + location.search); route();
    } catch (e) { err.textContent = e.message || "تعذّر الدخول"; go.disabled = false; go.textContent = "دخول"; }
  };
}

// ---------- الطالب: قائمة الامتحانات ----------
function examState(e) {
  var n = nowMs(), s = Date.parse(e.starts_at), d = Date.parse(e.ends_at);
  if (e.status === "published" && n >= s && n < d) return "open";
  if (e.status === "published" && n < s) return "soon";
  return "ended";
}
function examCard(e, sub, gr) {
  var st = examState(e), chip = "", meta = "";
  if (st === "open") {
    chip = '<span class="chip live">مفتوح</span>';
    meta = '<div class="cd" data-end="' + esc(e.ends_at) + '">--</div><p class="mu">المتبقي على انتهاء الوقت</p>';
  } else if (st === "soon") {
    chip = '<span class="chip">قادم</span>'; meta = '<p class="mu">يبدأ ' + fmt(e.starts_at) + "</p>";
  } else if (gr) {
    chip = '<span class="chip done">الدرجة منشورة</span>';
    meta = '<p class="score">' + num(gr.total) + " <span>من " + num(e.max_score) + "</span></p>";
  } else if (sub) {
    chip = '<span class="chip done">تم التسليم</span>'; meta = '<p class="mu">بانتظار التصحيح</p>';
  } else {
    chip = '<span class="chip bad">لم يُسلَّم</span>'; meta = '<p class="mu">انتهى ' + fmt(e.ends_at) + "</p>";
  }
  return '<a class="card ' + (st === "open" ? "open" : "") + '" href="#/exam/' + e.id + '"><div class="row"><h3>' + esc(e.title) + "</h3>" + chip + "</div>" + meta +
    (st === "open" && sub ? '<p class="mu">سُلّمت النسخة ' + sub.current_version + "، ويمكنك إعادة التسليم</p>" : "") + "</a>";
}
async function viewExams() {
  var my = rid;
  var r = await Promise.all([
    api("/rest/v1/exams?select=id,title,starts_at,ends_at,status,max_score&order=ends_at.desc"),
    api("/rest/v1/submissions?select=exam_id,current_version,state"),
    api("/rest/v1/grading_jobs?select=total,notes,submissions(exam_id)")
  ]);
  var subs = {}, grs = {};
  r[1].forEach(function (s) { subs[s.exam_id] = s; });
  r[2].forEach(function (g) { if (g.submissions) grs[g.submissions.exam_id] = g; });
  var groups = { open: [], soon: [], ended: [] };
  r[0].forEach(function (e) { groups[examState(e)].push(e); });
  var html = "";
  [["open", "مفتوحة الآن"], ["soon", "قادمة"], ["ended", "المنتهية"]].forEach(function (g) {
    if (groups[g[0]].length) html += '<h2 class="mu mb mt">' + g[1] + "</h2>" + groups[g[0]].map(function (e) { return examCard(e, subs[e.id], grs[e.id]); }).join("");
  });
  if (!html) html = '<p class="empty">لا توجد امتحانات لك حتى الآن. ستظهر هنا عندما يضيفها مدرسك.</p>';
  if (!paint(my, shell("امتحاناتي", html))) return;
  startTicker(); refreshUnread();
}

// ---------- الطالب: صفحة الامتحان والتسليم ----------
async function viewExam(id) {
  var my = rid;
  if (!UUID.test(id || "")) { location.hash = "#/exams"; return; }
  var r = await Promise.all([
    api("/rest/v1/exams?select=id,title,instructions,starts_at,ends_at,status,max_score,allow_resubmit&id=eq." + id),
    api("/rest/v1/exam_files?select=storage_path,page_no&exam_id=eq." + id + "&order=page_no"),
    api("/rest/v1/submissions?select=current_version,state,updated_at&exam_id=eq." + id),
    api("/rest/v1/grading_jobs?select=total,notes,submissions(exam_id)")
  ]);
  var e = r[0][0]; if (!e) throw new ApiError(404, "NF", "الامتحان غير موجود");
  var sub = r[2][0], gr = r[3].filter(function (g) { return g.submissions && g.submissions.exam_id === id; })[0];
  var urls = await Promise.all(r[1].map(function (f) { return signedUrl("exam-files", f.storage_path); }));
  var st = examState(e), html = '<div class="card' + (st === "open" ? " open" : "") + '"><div class="row"><h3>' + esc(e.title) + "</h3>" +
    (st === "open" ? '<span class="chip live">مفتوح</span>' : st === "soon" ? '<span class="chip">قادم</span>' : '<span class="chip">منتهٍ</span>') + "</div>";
  if (st === "open") html += '<div class="cd" data-end="' + esc(e.ends_at) + '">--</div><p class="mu">ينتهي ' + fmt(e.ends_at) + "</p>";
  else if (st === "soon") html += '<p class="mu">يبدأ ' + fmt(e.starts_at) + "</p>";
  else html += '<p class="mu">انتهى ' + fmt(e.ends_at) + "</p>";
  if (e.instructions) html += '<p class="pre mt">' + esc(e.instructions) + "</p>";
  html += "</div>";
  if (gr) html += '<div class="card"><h3>درجتك</h3><p class="score">' + num(gr.total) + " <span>من " + num(e.max_score) + "</span></p>" + (gr.notes ? '<p class="pre mt">' + esc(gr.notes) + "</p>" : "") + "</div>";
  if (urls.length && st !== "soon") {
    html += '<div class="card"><h3 class="mb">ورقة الأسئلة</h3>' + r[1].map(function (f, i) {
      return /\.pdf$/i.test(f.storage_path) ? '<a class="btn ghost full mb" href="' + esc(urls[i]) + '" target="_blank" rel="noopener">فتح ملف الأسئلة PDF</a>'
        : '<img class="pg" src="' + esc(urls[i]) + '" alt="صفحة ' + (i + 1) + ' من الأسئلة" loading="lazy">';
    }).join("") + "</div>";
  }
  if (st === "open") {
    var can = !sub || e.allow_resubmit;
    html += '<div class="card"><h3>إجابتك</h3><p class="mu mb">' + (sub ? "سُلّمت النسخة " + sub.current_version + "، آخر تحديث " + fmt(sub.updated_at) : "لم تسلّم إجابتك بعد") + "</p>";
    if (can) {
      html += '<p class="mu mb">' + (sub ? "كل تسليم جديد يحل محل السابق، فأرفق كل صفحات إجابتك من جديد." : "صوّر صفحات إجابتك أو اختر ملف PDF.") + "</p>" +
        '<label class="btn ghost full pick">اختيار صور أو ملف<input id="fi" type="file" accept="image/*,application/pdf" multiple></label>' +
        '<ul class="files" id="fl"></ul><button class="btn full mt" id="sg" disabled>' + (sub ? "إعادة تسليم الإجابة" : "تسليم الإجابة") + '</button><p class="mu mt" id="sp" role="status"></p>';
    } else html += '<p class="mu">هذا الامتحان لا يسمح بإعادة التسليم.</p>';
    html += "</div>";
  } else if (st === "ended" && !gr) {
    html += '<div class="card"><h3>إجابتك</h3><p class="mu">' + (sub ? "تم تسليم النسخة " + sub.current_version + "، وهي بانتظار التصحيح." : "لم تسلّم إجابة لهذا الامتحان.") + "</p></div>";
  }
  if (!paint(my, shell("الامتحان", html, "#/exams"))) return;
  startTicker();
  if (st === "open" && $("#fi")) setupSubmit(id);
}
function setupSubmit(examId) {
  var files = [], fi = $("#fi"), list = $("#fl"), go = $("#sg"), sp = $("#sp");
  function draw() {
    list.innerHTML = files.map(function (f, i) {
      return "<li><span>" + esc(f.name) + " <small class=\"mu\">" + (f.size / 1048576).toFixed(1) + ' م.ب</small></span><button type="button" class="x" data-i="' + i + '" aria-label="حذف الملف">×</button></li>';
    }).join("");
    go.disabled = !files.length;
    list.querySelectorAll(".x").forEach(function (b) { b.onclick = function () { files.splice(+b.dataset.i, 1); draw(); }; });
  }
  fi.onchange = function () { files = files.concat(Array.from(fi.files)).slice(0, 30); fi.value = ""; draw(); };
  go.onclick = async function () {
    go.disabled = true; sp.textContent = "جارٍ التحضير…";
    try {
      await submitAnswer(examId, files, function (i, n) { sp.textContent = "تم رفع " + i + " من " + n + "…"; });
      toast("تم تسليم إجابتك"); route();
    } catch (e) { toast(e.message || "تعذّر التسليم", true); sp.textContent = ""; go.disabled = false; }
  };
  draw();
}

// ---------- الطالب: الإشعارات ----------
async function viewNotifs() {
  var my = rid;
  var l = await api("/rest/v1/notifications?select=id,title,body,read_at,created_at&order=created_at.desc&limit=40");
  var un = l.filter(function (n) { return !n.read_at; }).length;
  unread = un;
  var html = (un ? '<button class="btn ghost full mb" id="ra">تعليم الكل كمقروء</button>' : "") +
    (l.length ? l.map(function (n) {
      return '<div class="card' + (n.read_at ? "" : " open") + '"><h3>' + esc(n.title) + "</h3><p>" + esc(n.body) + '</p><p class="mu">' + fmt(n.created_at) + "</p></div>";
    }).join("") : '<p class="empty">لا توجد إشعارات بعد. ستظهر هنا نتائج امتحاناتك.</p>');
  if (!paint(my, shell("الإشعارات", html))) return;
  if (un) $("#ra").onclick = async function () {
    try {
      await api("/rest/v1/notifications?read_at=is.null", { method: "PATCH", body: { read_at: new Date().toISOString() } });
      unread = 0; viewNotifs();
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- المصحح ----------
var JSTATE = { assigned: ["بانتظار التصحيح", ""], in_progress: ["مسودة", "live"], done: ["معتمد", "done"] };
async function viewQueue() {
  var my = rid;
  var jobs = await api("/rest/v1/grading_jobs?select=id,state,total,submissions(exam_id,exams(title,max_score))&state=neq.published");
  var ord = { assigned: 0, in_progress: 1, done: 2 };
  jobs.sort(function (a, b) { return ord[a.state] - ord[b.state]; });
  var done = jobs.filter(function (j) { return j.state === "done"; }).length;
  var html = jobs.length
    ? '<div class="card"><div class="row"><h3>تقدّم التصحيح</h3><span class="mu">' + done + " من " + jobs.length + '</span></div><div class="bar"><i style="width:' + Math.round(done / jobs.length * 100) + '%"></i></div></div>' +
      jobs.map(function (j) {
        var t = j.submissions && j.submissions.exams ? j.submissions.exams.title : "";
        return '<a class="card" href="#/grade/' + j.id + '"><div class="row"><h3>تسليم ' + esc(j.id.slice(-4).toUpperCase()) + '</h3><span class="chip ' + JSTATE[j.state][1] + '">' + JSTATE[j.state][0] + '</span></div><p class="mu">' + esc(t) + "</p></a>";
      }).join("")
    : '<p class="empty">لا توجد تسليمات مكلَّف بها حالياً. ستظهر هنا عندما يوزّع المدرس التصحيح.</p>';
  paint(my, shell("التصحيح", html));
}
async function viewGrade(id) {
  var my = rid;
  if (!UUID.test(id || "")) { location.hash = "#/queue"; return; }
  var jobs = await api("/rest/v1/grading_jobs?select=id,state,total,notes,submission_id,submissions(exam_id,exams(title,max_score))&id=eq." + id);
  var j = jobs[0]; if (!j) throw new ApiError(404, "NF", "التسليم غير موجود");
  var vs = await api("/rest/v1/submission_versions?select=version,submission_files(storage_path,page_no)&submission_id=eq." + j.submission_id + "&order=version.desc&limit=1");
  var files = ((vs[0] && vs[0].submission_files) || []).sort(function (a, b) { return a.page_no - b.page_no; });
  var urls = await Promise.all(files.map(function (f) { return signedUrl("submissions", f.storage_path); }));
  var mx = j.submissions.exams.max_score;
  var html = '<div class="card"><h3>' + esc(j.submissions.exams.title) + '</h3><p class="mu">الدرجة العظمى ' + num(mx) + "</p></div>" +
    '<div class="card"><h3 class="mb">صفحات الإجابة</h3>' + (files.length ? files.map(function (f, i) {
      return /\.pdf$/i.test(f.storage_path) ? '<a class="btn ghost full mb" href="' + esc(urls[i]) + '" target="_blank" rel="noopener">فتح الملف PDF (' + (i + 1) + ")</a>"
        : '<img class="pg" src="' + esc(urls[i]) + '" alt="صفحة ' + (i + 1) + '" loading="lazy">';
    }).join("") : '<p class="mu">لا توجد ملفات في هذا التسليم.</p>') + "</div>" +
    '<div class="card stack"><label>الدرجة من ' + num(mx) + '<input id="gt" type="number" inputmode="decimal" min="0" max="' + mx + '" step="0.25" value="' + (j.total == null ? "" : num(j.total)) + '"></label>' +
    '<label>ملاحظات للطالب (اختياري)<textarea id="gn" rows="3">' + esc(j.notes || "") + "</textarea></label>" +
    '<button class="btn full" id="gf">اعتماد الدرجة</button><button class="btn ghost full" id="gd">حفظ كمسودة</button></div>';
  if (!paint(my, shell("تصحيح تسليم " + id.slice(-4).toUpperCase(), html, "#/queue"))) return;
  async function save(done) {
    var v = parseFloat($("#gt").value);
    if (isNaN(v) || v < 0 || v > mx) { toast("اكتب درجة بين 0 و " + num(mx), true); return; }
    $("#gf").disabled = $("#gd").disabled = true;
    try {
      await api("/rest/v1/rpc/save_grade", { method: "POST", body: { p_job: j.id, p_total: v, p_per_question: null, p_notes: $("#gn").value.trim() || null, p_done: done } });
      toast(done ? "تم اعتماد الدرجة" : "تم حفظ المسودة");
      if (done) location.hash = "#/queue"; else { $("#gf").disabled = $("#gd").disabled = false; }
    } catch (e) { toast(e.message, true); $("#gf").disabled = $("#gd").disabled = false; }
  }
  $("#gf").onclick = function () { save(true); };
  $("#gd").onclick = function () { save(false); };
}

// ---------- المدرس والمدير (الدفعة القادمة) ----------
function viewStaffSoon() {
  var my = rid;
  paint(my, shell("الرئيسية", '<div class="card"><h3>أهلاً ' + esc(session.user.name) + '</h3><p class="mu mt">لوحة المدرس والإدارة تُضاف في الإصدار القادم: الطلاب والأكواد والأجهزة والمجموعات وإنشاء الامتحانات ونشر الدرجات.</p></div>'));
}

// ---------- الحساب ----------
function viewAccount() {
  var my = rid, roles = { student: "طالب", examiner: "مصحح", teacher: "مدرس", super_admin: "مدير عام" };
  paint(my, shell("حسابي", '<div class="card"><h3>' + esc(session.user.name) + '</h3><p class="mu">' + (roles[session.role] || "") + "</p></div>" +
    '<div class="card"><h3 class="mb">المظهر</h3><div class="seg" id="th" style="margin:0"><button data-v="dark">داكن</button><button data-v="light">فاتح</button></div></div>' +
    '<button class="btn ghost full" id="lo">تسجيل الخروج</button><p class="mu ver">الإصدار 1</p>'));
  var cur = Store.get("theme") || "dark";
  document.querySelectorAll("#th button").forEach(function (b) {
    b.classList.toggle("on", b.dataset.v === cur);
    b.onclick = function () { Store.set("theme", b.dataset.v); applyTheme(); viewAccount(); };
  });
  $("#lo").onclick = function () { doLogout(); history.replaceState(null, "", location.pathname); route(); };
}

// ---------- التوجيه ----------
async function route() {
  clearInterval(ticker);
  var my = ++rid;
  if (!session) { viewLogin(); return; }
  var p = (location.hash || "").replace(/^#\/?/, "").split("/"), r = session.role;
  app.innerHTML = '<div class="load">جارٍ التحميل…</div>';
  try {
    if (r === "student") {
      if (p[0] === "exam") return await viewExam(p[1]);
      if (p[0] === "notifications") return await viewNotifs();
      if (p[0] === "account") return viewAccount();
      return await viewExams();
    }
    if (r === "examiner") {
      if (p[0] === "grade") return await viewGrade(p[1]);
      if (p[0] === "account") return viewAccount();
      return await viewQueue();
    }
    if (p[0] === "account") return viewAccount();
    return viewStaffSoon();
  } catch (e) {
    if (!session) { viewLogin(); return; }
    showError(e, my);
  }
}
window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
