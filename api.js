"use strict";
// طبقة الاتصال بـ Supabase. كل مكالمات الخادم هنا، والشاشات في app.js.
var CFG = {
  url: "https://lssemlslutumctzhdxip.supabase.co",
  key: "sb_publishable_ES6539W3pHzNTrmNsEN_Fw_9utRwHgr" // مفتاح عام مصمَّم ليظهر في التطبيقات
};

var Store = {
  get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};

var session = Store.get("session"); // { access_token, refresh_token, expires_at, role, user:{id,name} }
var clockOffset = 0;                // فرق ساعة الجهاز عن ساعة الخادم
function nowMs() { return Date.now() + clockOffset; }

function deviceId() {
  var d = Store.get("device_id");
  if (!d) {
    d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
    Store.set("device_id", d);
  }
  return d;
}

var MSG = {
  EXAM_CLOSED: "انتهى وقت الامتحان أو لم يبدأ بعد",
  RESUBMIT_NOT_ALLOWED: "لا يُسمح بإعادة التسليم في هذا الامتحان",
  NOT_ALLOWED: "هذا الامتحان غير متاح لك",
  NOT_STUDENT: "هذه العملية للطلاب فقط",
  BAD_FILES: "اختر من 1 إلى 30 ملفاً",
  BAD_PATH: "مسار ملف غير صحيح",
  BAD_SCORE: "الدرجة خارج الحد المسموح",
  ALREADY_PUBLISHED: "نُشرت هذه الدرجة ولا يمكن تعديلها",
  NOT_FOUND: "العنصر غير موجود",
  FORBIDDEN: "ليست لديك صلاحية لهذه العملية"
};

class ApiError extends Error {
  constructor(status, code, msg) { super(msg); this.status = status; this.code = code; }
}

function fail(res) {
  var d = res.data, m = null, code = "ERR";
  if (d && typeof d === "object") {
    code = d.error || d.code || code;
    m = MSG[d.message] || MSG[d.error] || null;
    if (!m && typeof d.message === "string" && /[\u0600-\u06FF]/.test(d.message)) m = d.message;
  }
  if (!m && res.status === 401) m = "انتهت الجلسة، سجّل الدخول مرة أخرى";
  return new ApiError(res.status, code, m || "حدث خطأ، حاول مرة أخرى");
}

async function raw(path, o) {
  o = o || {};
  var h = Object.assign({ apikey: CFG.key }, o.headers || {});
  if (o.token) h.Authorization = "Bearer " + o.token;
  var body = o.blob || undefined;
  if (o.body !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(o.body); }
  var r;
  try { r = await fetch(CFG.url + path, { method: o.method || "GET", headers: h, body: body }); }
  catch (e) { throw new ApiError(0, "NETWORK", "لا يوجد اتصال بالإنترنت، تحقق من الشبكة وحاول مرة أخرى"); }
  var dh = r.headers.get("Date");
  if (dh) { var t = Date.parse(dh); if (!isNaN(t)) clockOffset = t - Date.now(); }
  var txt = await r.text(), data;
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  return { ok: r.ok, status: r.status, data: data };
}

function saveTokens(d) {
  session.access_token = d.access_token;
  session.refresh_token = d.refresh_token;
  session.expires_at = Date.now() + (d.expires_in || 3600) * 1000;
  Store.set("session", session);
}

var refreshing = null;
function refreshSession() {
  if (!session || !session.refresh_token) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = (async function () {
      try {
        var r = await raw("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } });
        if (r.ok && r.data && r.data.access_token) { saveTokens(r.data); return true; }
        if (r.status >= 400 && r.status < 500) { doLogout(); }
        return false;
      } catch (e) { return false; }
    })().finally(function () { refreshing = null; });
  }
  return refreshing;
}

async function api(path, o) {
  o = o || {};
  if (session && session.expires_at - Date.now() < 60000) await refreshSession();
  var res = await raw(path, Object.assign({}, o, { token: session && session.access_token }));
  if (res.status === 401 && session) {
    if (await refreshSession()) res = await raw(path, Object.assign({}, o, { token: session.access_token }));
  }
  if (!res.ok) throw fail(res);
  return res.data;
}

function doLogout() { session = null; Store.del("session"); signCache.clear(); }

async function loginStudent(name, code) {
  var r = await raw("/functions/v1/hyper-action", {
    method: "POST",
    body: { name: name.trim(), code: code.trim(), device_id: deviceId(), device_label: navigator.userAgent.slice(0, 80) }
  });
  if (!r.ok || !r.data || !r.data.session) throw fail(r);
  var s = r.data.session;
  session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in || 3600) * 1000,
    role: "student", user: { id: r.data.student.id, name: r.data.student.full_name } };
  Store.set("session", session);
}

async function loginStaff(email, pw) {
  var r = await raw("/auth/v1/token?grant_type=password", { method: "POST", body: { email: email.trim(), password: pw } });
  if (!r.ok || !r.data || !r.data.access_token) throw new ApiError(r.status, "INVALID", "البريد أو كلمة المرور غير صحيحة");
  var st = await raw("/rest/v1/staff?select=full_name,role,active&id=eq." + r.data.user.id, { token: r.data.access_token });
  var row = st.ok && st.data && st.data[0];
  if (!row || !row.active) throw new ApiError(403, "NOSTAFF", "هذا الحساب غير مفعّل ككادر");
  session = { access_token: r.data.access_token, refresh_token: r.data.refresh_token, expires_at: Date.now() + (r.data.expires_in || 3600) * 1000,
    role: row.role, user: { id: r.data.user.id, name: row.full_name } };
  Store.set("session", session);
}

// ---------- الملفات ----------
var signCache = new Map();
async function signedUrl(bucket, path) {
  var k = bucket + "/" + path, c = signCache.get(k);
  if (c && c.exp > Date.now()) return c.url;
  var d = await api("/storage/v1/object/sign/" + bucket + "/" + path, { method: "POST", body: { expiresIn: 3600 } });
  var url = CFG.url + "/storage/v1" + d.signedURL;
  signCache.set(k, { url: url, exp: Date.now() + 3000 * 1000 });
  return url;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// رفع مع إعادة محاولة وتأخير عشوائي (يخفف الضغط وقت الذروة)
async function uploadFile(bucket, path, blob, type) {
  var last;
  for (var i = 0; i < 3; i++) {
    try {
      await api("/storage/v1/object/" + bucket + "/" + path, { method: "POST", blob: blob, headers: { "Content-Type": type } });
      return;
    } catch (e) {
      last = e;
      if (e.status === 400 || e.status === 403) throw new ApiError(403, "UPLOAD", "تعذّر رفع الملف. تأكد أن الوقت لم ينتهِ وأن نوع الملف وحجمه مناسبان");
      if (e.status === 401) throw e;
      await sleep(800 * (i + 1) + Math.random() * 600);
    }
  }
  throw last;
}

// ضغط الصورة قبل الرفع (JPG بعرض أقصى 1600 بكسل)
function shrink(file, maxW, q) {
  return new Promise(function (res, rej) {
    function out(src, w, h) {
      var k = Math.min(1, maxW / w), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
      c.toBlob(function (b) { b ? res(b) : rej(new Error("تعذّر ضغط الصورة")); }, "image/jpeg", q);
    }
    function viaImg() {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { out(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(u); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("صيغة الصورة غير مدعومة، استخدم JPG أو PNG")); };
      im.src = u;
    }
    if (window.createImageBitmap) {
      createImageBitmap(file, { imageOrientation: "from-image" }).then(function (b) { out(b, b.width, b.height); }).catch(viaImg);
    } else viaImg();
  });
}

// تسليم الإجابة: رفع الملفات ثم تثبيت التسليم دفعة واحدة على الخادم
async function submitAnswer(examId, files, onProgress) {
  var uid = session.user.id, paths = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i], blob, ext;
    if (f.type === "application/pdf") {
      if (f.size > 10 * 1024 * 1024) throw new Error("ملف PDF أكبر من 10 ميغابايت");
      blob = f; ext = "pdf";
    } else { blob = await shrink(f, 1600, 0.8); ext = "jpg"; }
    var p = examId + "/" + uid + "/" + Date.now() + "-" + (i + 1) + "." + ext;
    await uploadFile("submissions", p, blob, blob.type || (ext === "pdf" ? "application/pdf" : "image/jpeg"));
    paths.push(p);
    if (onProgress) onProgress(i + 1, files.length);
  }
  return api("/rest/v1/rpc/submit_answer", { method: "POST", body: { p_exam: examId, p_paths: paths } });
}
