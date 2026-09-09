/* إعدادات Firebase — مفاتيح عامة بطبيعتها؛ الحماية في قواعد Firestore */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBY601N2yFW8PnrWaHJM05GOvCj7wdJLXM",
  authDomain: "sijil-app-de556.firebaseapp.com",
  projectId: "sijil-app-de556",
  storageBucket: "sijil-app-de556.firebasestorage.app",
  messagingSenderId: "278465090183",
  appId: "1:278465090183:web:e54370dfd4f67660af5e22"
};

/* مفتاح App Check (reCAPTCHA Enterprise) — عام بطبيعته، مقيّد بنطاق erihdev.github.io */
window.APPCHECK_SITE_KEY = "6LfyzaktAAAAACXGDfkljYD65230YrRTOPXEJgVB";

/* ═══════════════ مساحة المدرسة ═══════════════
   كل مدرسةٍ تشتري «سجلي» تعمل على بياناتها وحدها: مساراتها كلها تحت sp/{code}،
   وقواعد فايرستور تحمل نسخةً مطابقة تحت المسار نفسه (scratchpad/gen_space_rules.py)
   فلا يقرأ معلمُ مدرسةٍ حرفاً من مدرسةٍ أخرى. ومدرستنا الأولى تبقى في الجذر بلا رمز
   وبلا ترحيلٍ لبياناتها.

   من أين يأتي الرمز؟ من ?s=CODE في الرابط أول مرة (رابط الدعوة الذي يوزّعه المدير)،
   ثم يُحفظ في الجهاز فلا يُكتب مرة أخرى. والخروج من المدرسة بـ?s= فارغة. */
(function () {
  var K = 'sijil.space';
  var code = '';
  try {
    var m = /[?&]s=([A-Za-z0-9]{0,12})(&|$)/.exec(location.search);
    if (m) { code = String(m[1] || '').toLowerCase(); localStorage.setItem(K, code); }
    else code = String(localStorage.getItem(K) || '').toLowerCase();
  } catch (e) { code = ''; }
  if (!/^[a-z0-9]{6,12}$/.test(code)) code = '';
  window.SIJIL_SPACE = code;
  window.SIJIL_SPACE_PREFIX = code ? ('sp/' + code + '/') : '';
  /* لافٌّ رقيق: كل ما يستعمله التطبيق من فايرستور هو doc وcollection وrunTransaction.
     المراجع الراجعة من doc/collection مسبوقةٌ أصلاً، فالمعاملات والاستعلامات تعمل كما هي. */
  window.sijilSpaceDb = function (raw) {
    if (!raw || !window.SIJIL_SPACE_PREFIX) return raw;
    var pre = window.SIJIL_SPACE_PREFIX;
    return {
      doc: function (p) { return raw.doc(pre + p); },
      collection: function (p) { return raw.collection(pre + p); },
      runTransaction: function (fn) { return raw.runTransaction(fn); },
      batch: function () { return raw.batch(); },
      app: raw.app,
      __raw: raw,
      __space: window.SIJIL_SPACE
    };
  };
})();
