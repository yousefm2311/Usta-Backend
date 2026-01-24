const Customer = require('../../models/customer.model');
const Artisan = require('../../models/artisan.model');

const DEFAULT_LANG = 'ar';
const SUPPORTED_LANGS = new Set(['ar', 'en']);

function normalizeLang(lang) {
  const value = String(lang || '').trim().toLowerCase();
  return SUPPORTED_LANGS.has(value) ? value : DEFAULT_LANG;
}

const TEXTS = {
  new_message: { en: 'New message', ar: 'رسالة جديدة' },
  new_direct_message: { en: 'New direct message', ar: 'رسالة مباشرة جديدة' },
  sent_attachment: { en: 'Sent an attachment', ar: 'تم إرسال مرفق' },
  new_review: { en: 'New review', ar: 'مراجعة جديدة' },
  review_reply: { en: 'Review reply', ar: 'رد على المراجعة' },

  request_accepted_title: { en: 'Request accepted', ar: 'تم قبول طلبك' },
  request_accepted_body: { en: 'An artisan accepted your request.', ar: 'الحرفي قبل طلبك' },
  request_rejected_title: { en: 'Request rejected', ar: 'تم رفض طلبك' },
  request_rejected_body: { en: 'Your request was rejected.', ar: 'تم رفض طلبك.' },
  work_started_title: { en: 'Work started', ar: 'بدأ العمل' },
  work_started_body: { en: 'The artisan started working on your request.', ar: 'الحرفي بدأ العمل على طلبك.' },
  confirm_completion_title: { en: 'Confirm completion', ar: 'تأكيد الإنهاء' },
  confirm_completion_body: { en: 'Artisan marked your request as completed. Please confirm.', ar: 'الحرفي أنهى الطلب. يرجى التأكيد.' },
  request_expired_title: { en: 'Request expired', ar: 'انتهت صلاحية الطلب' },
  request_expired_body_customer: { en: 'Your request expired because no artist accepted it within 24 hours.', ar: 'انتهت صلاحية طلبك لأنه لم يقبله أي حرفي خلال 24 ساعة.' },
  request_expired_body_artisan: { en: 'The pending request expired after 24 hours without confirmation.', ar: 'انتهت صلاحية الطلب المعلق بعد 24 ساعة بدون تأكيد.' },
  request_auto_completed_title: { en: 'Request auto-completed', ar: 'تم إكمال الطلب تلقائيًا' },
  request_auto_completed_body: { en: 'We auto-confirmed the request after 2 hours without feedback.', ar: 'تم تأكيد الطلب تلقائيًا بعد ساعتين بدون رد.' },
  completion_confirmed_title: { en: 'Completion confirmed', ar: 'تم تأكيد الإنهاء' },
  completion_confirmed_body: { en: 'Customer confirmed the job is done.', ar: 'العميل أكد اكتمال الطلب.' },
  request_cancelled_title: { en: 'Request cancelled', ar: 'تم إلغاء الطلب' },
  request_cancelled_by_customer_body: { en: 'The customer cancelled the request.', ar: 'العميل ألغى الطلب.' },
  request_cancelled_by_artisan_body: { en: 'The artisan cancelled the request.', ar: 'الحرفي ألغى الطلب.' },
  request_update_title: { en: 'Request update', ar: 'تحديث الطلب' },
  request_status_updated_title: { en: 'Request status updated', ar: 'تم تحديث حالة الطلب' },

  request_removed_title: { en: 'Request removed', ar: 'تم حذف الطلب' },
  request_removed_body_customer: { en: 'Your request was removed by admin.', ar: 'تم حذف طلبك بواسطة الإدارة.' },
  request_removed_body_artisan: { en: 'A request was removed by admin.', ar: 'تم حذف طلب بواسطة الإدارة.' },

  request_closed_title: { en: 'Request closed', ar: 'تم إغلاق الطلب' },
  request_closed_body_customer: { en: 'Your request was closed by admin.', ar: 'تم إغلاق طلبك بواسطة الإدارة.' },
  request_closed_body_artisan: { en: 'The request was closed by admin.', ar: 'تم إغلاق الطلب بواسطة الإدارة.' },

  new_request_assigned_title: { en: 'New request assigned', ar: 'تم إسناد طلب جديد' },
  new_request_title: { en: 'New request', ar: 'طلب جديد' },
  new_admin_message: { en: 'New admin message', ar: 'رسالة جديدة من الإدارة' },

  price_accepted_title: { en: 'Price accepted', ar: 'تم قبول السعر المقترح' },
  price_accepted_body: { en: 'Customer accepted the proposed price.', ar: 'قام العميل بقبول السعر المقترح.' },
  price_rejected_title: { en: 'Price rejected', ar: 'تم رفض السعر المقترح' },
  price_rejected_body: { en: 'Customer rejected the proposed price.', ar: 'قام العميل برفض السعر المقترح.' },
  price_accepted_body_long: { en: 'Customer accepted the proposed price and can pay now.', ar: 'قام العميل بقبول السعر المقترح ويمكنه الدفع الآن.' },
  price_rejected_body_long: { en: 'Customer rejected the proposed price. Please submit a new offer.', ar: 'قام العميل برفض السعر المقترح. يرجى تقديم عرض جديد.' },

  account_blocked_title: { en: 'Account blocked', ar: 'تم حظر الحساب' },
  account_unblocked_title: { en: 'Account unblocked', ar: 'تم إلغاء حظر الحساب' },
  account_blocked_body: { en: 'Your account has been blocked by admin.', ar: 'تم حظر حسابك بواسطة الإدارة.' },
  account_unblocked_body: { en: 'Your account has been unblocked by admin.', ar: 'تم إلغاء حظر حسابك بواسطة الإدارة.' },
  account_deleted_title: { en: 'Account deleted', ar: 'تم حذف الحساب' },
  account_deleted_body: { en: 'Your account has been deleted by admin.', ar: 'تم حذف حسابك بواسطة الإدارة.' },
  account_approved_title: { en: 'Account approved', ar: 'تم اعتماد الحساب' },
  account_approved_body: { en: 'Your account has been approved by admin.', ar: 'تم اعتماد حسابك بواسطة الإدارة.' },
  account_rejected_title: { en: 'Account rejected', ar: 'تم رفض الحساب' },
  account_rejected_body: { en: 'Your account has been rejected by admin.', ar: 'تم رفض حسابك بواسطة الإدارة.' },
  account_suspended_title: { en: 'Account suspended', ar: 'تم إيقاف الحساب' },
  account_reactivated_title: { en: 'Account reactivated', ar: 'تم إعادة تفعيل الحساب' },
  account_suspended_body: { en: 'Your account has been suspended by admin.', ar: 'تم إيقاف حسابك بواسطة الإدارة.' },
  account_reactivated_body: { en: 'Your account has been reactivated by admin.', ar: 'تم إعادة تفعيل حسابك بواسطة الإدارة.' },

  complaint_status_updated_title: { en: 'Complaint status updated', ar: 'تم تحديث حالة الشكوى' },
  complaint_assigned_title: { en: 'Complaint assigned', ar: 'تم إسناد الشكوى' },
  complaint_assigned_body: { en: 'Your complaint has been assigned to a support agent.', ar: 'تم إسناد شكواك إلى موظف الدعم.' },
  complaint_reply_title: { en: 'Complaint reply', ar: 'رد على الشكوى' },
  complaint_note_title: { en: 'Complaint note', ar: 'ملاحظة على الشكوى' },

  report_reply_title: { en: 'Report reply', ar: 'رد على البلاغ' },
  report_closed_title: { en: 'Report closed', ar: 'تم إغلاق البلاغ' },
  report_closed_body: { en: 'Your report was closed by admin.', ar: 'تم إغلاق بلاغك بواسطة الإدارة.' },

  withdrawal_approved_title: { en: 'Withdrawal approved', ar: 'تمت الموافقة على السحب' },
  withdrawal_rejected_title: { en: 'Withdrawal rejected', ar: 'تم رفض السحب' },

  payout_status_updated_title: { en: 'Payout status updated', ar: 'تم تحديث حالة الدفعة' },
};

const ALIASES = {
  'تم قبول طلبك': 'request_accepted_title',
  'الحرفي قبل طلبك': 'request_accepted_body',
  'تم رفض طلبك': 'request_rejected_title',
  'الحرفي رفض الطلب': 'request_rejected_body',
  'الحرفي بدأ العمل': 'work_started_title',
  'تم بدء تنفيذ الطلب': 'work_started_body',
  'تاكيد الانهاء': 'confirm_completion_title',
  'تاكيد الإنهاء': 'confirm_completion_title',
  'يرجى تأكيد اكتمال الطلب': 'confirm_completion_body',
  'تم التأكيد': 'completion_confirmed_title',
  'العميل أكد اكتمال الطلب': 'completion_confirmed_body',
  'طلب تم إلغاؤه': 'request_cancelled_title',
  'تم إلغاء الطلب': 'request_cancelled_title',
  'العميل ألغى الطلب': 'request_cancelled_by_customer_body',
  'الحرفي ألغى الطلب': 'request_cancelled_by_artisan_body',
  'طلب جديد': 'new_request_title',
  'Price accepted': 'price_accepted_title',
  'Price rejected': 'price_rejected_title',
  'Customer accepted the proposed price.': 'price_accepted_body',
  'Customer rejected the proposed price.': 'price_rejected_body',
  'قام العميل بقبول السعر المقترح ويمكنه الدفع الآن.': 'price_accepted_body_long',
  'قام العميل برفض السعر المقترح. يرجى تقديم عرض جديد.': 'price_rejected_body_long',
};

const TEXT_KEY_BY_VALUE = new Map();
Object.entries(TEXTS).forEach(([key, value]) => {
  if (value.en) TEXT_KEY_BY_VALUE.set(value.en, key);
  if (value.ar) TEXT_KEY_BY_VALUE.set(value.ar, key);
});
Object.entries(ALIASES).forEach(([text, key]) => {
  TEXT_KEY_BY_VALUE.set(text, key);
});

const STATUS_TRANSLATIONS = {
  new: 'جديد',
  assigned: 'تم الإسناد',
  accepted: 'مقبول',
  in_progress: 'قيد التنفيذ',
  awaiting_confirmation: 'بانتظار التأكيد',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  canceled: 'ملغي',
  rejected: 'مرفوض',
  closed: 'مغلق',
  expired: 'منتهي',
  priced: 'تم التسعير',
  awaiting_customer_price_confirm: 'بانتظار موافقة العميل على السعر',
  price_rejected: 'تم رفض السعر',
  need_new_price: 'بحاجة لسعر جديد',
  on_the_way: 'في الطريق',
  arrived: 'تم الوصول',
  work_started: 'بدأ العمل',
  working: 'جارٍ العمل',
  awaiting_payment: 'بانتظار الدفع',
  open: 'مفتوحة',
  in_review: 'قيد المراجعة',
  resolved: 'تم الحل',
  pending: 'قيد الانتظار',
  approved: 'تمت الموافقة',
  failed: 'فشل',
  done: 'تم',
};

const STATUS_AR_TO_EN = {};
Object.entries(STATUS_TRANSLATIONS).forEach(([en, ar]) => {
  if (!STATUS_AR_TO_EN[ar]) STATUS_AR_TO_EN[ar] = en;
});

function translateStatus(value, lang) {
  if (value === undefined || value === null) return value;
  const raw = String(value).trim();
  if (!raw) return raw;
  if (lang === 'ar') {
    if (STATUS_TRANSLATIONS[raw]) return STATUS_TRANSLATIONS[raw];
    const lower = raw.toLowerCase();
    if (STATUS_TRANSLATIONS[lower]) return STATUS_TRANSLATIONS[lower];
    return raw;
  }
  if (lang === 'en') {
    if (STATUS_AR_TO_EN[raw]) return STATUS_AR_TO_EN[raw];
    const lower = raw.toLowerCase();
    if (STATUS_TRANSLATIONS[lower]) return lower;
    return raw;
  }
  return raw;
}

function translateStatusPhrase(text, lang) {
  const prefixes = [
    { en: 'Status changed to ', ar: 'تم تغيير الحالة إلى ' },
    { en: 'Status updated to ', ar: 'تم تحديث الحالة إلى ' },
  ];
  for (const prefix of prefixes) {
    if (text.startsWith(prefix.en)) {
      const rest = text.slice(prefix.en.length);
      return buildStatusPhrase(prefix, rest, lang);
    }
    if (text.startsWith(prefix.ar)) {
      const rest = text.slice(prefix.ar.length);
      return buildStatusPhrase(prefix, rest, lang);
    }
  }
  return null;
}

function buildStatusPhrase(prefix, rest, lang) {
  const idx = rest.indexOf(' - ');
  const statusPart = idx === -1 ? rest : rest.slice(0, idx);
  const suffix = idx === -1 ? '' : rest.slice(idx);
  const translatedStatus = translateStatus(statusPart.trim(), lang);
  const usePrefix = lang === 'ar' ? prefix.ar : prefix.en;
  return `${usePrefix}${translatedStatus}${suffix}`;
}

function translateDynamicText(text, lang) {
  let match = text.match(/^You received a (\d+)-star review\.?$/i);
  if (match) {
    const rating = match[1];
    return lang === 'ar'
      ? `وصلتك مراجعة بتقييم ${rating} نجوم.`
      : `You received a ${rating}-star review.`;
  }
  match = text.match(/^وصلتك مراجعة بتقييم (\d+) نجوم\.?$/);
  if (match) {
    const rating = match[1];
    return lang === 'en'
      ? `You received a ${rating}-star review.`
      : text;
  }

  match = text.match(/^Withdrawal (.+) approved\.?$/i);
  if (match) {
    const ref = match[1];
    return lang === 'ar'
      ? `تمت الموافقة على السحب ${ref}`
      : `Withdrawal ${ref} approved`;
  }
  match = text.match(/^Withdrawal (.+) rejected\.?$/i);
  if (match) {
    const ref = match[1];
    return lang === 'ar'
      ? `تم رفض السحب ${ref}`
      : `Withdrawal ${ref} rejected`;
  }

  match = text.match(/^Your account was rejected: (.+)$/i);
  if (match) {
    const reason = match[1];
    return lang === 'ar'
      ? `تم رفض حسابك: ${reason}`
      : `Your account was rejected: ${reason}`;
  }
  match = text.match(/^تم رفض حسابك: (.+)$/);
  if (match) {
    const reason = match[1];
    return lang === 'en'
      ? `Your account was rejected: ${reason}`
      : text;
  }

  match = text.match(/^You have a new request(?: for (.+))?\.?$/i);
  if (match) {
    const service = match[1];
    if (lang === 'ar') {
      return service
        ? `لديك طلب جديد لخدمة ${service}.`
        : 'لديك طلب جديد.';
    }
    return service
      ? `You have a new request for ${service}.`
      : 'You have a new request.';
  }
  match = text.match(/^(?:لديك|عندك) طلب جديد(?: لخدمة (.+))?\.?$/);
  if (match) {
    const service = match[1];
    return lang === 'en'
      ? service
        ? `You have a new request for ${service}.`
        : 'You have a new request.'
      : text;
  }
  match = text.match(/^فيه طلب جديد قريب منك(?: لخدمة (.+))?\.?$/);
  if (match) {
    const service = match[1];
    return lang === 'en'
      ? service
        ? `There is a new request near you for ${service}.`
        : 'There is a new request near you.'
      : text;
  }

  match = text.match(/^A request was assigned to you(?:: (.+))?\.?$/i);
  if (match) {
    const service = match[1];
    if (lang === 'ar') {
      return service
        ? `تم إسناد طلب لك: ${service}.`
        : 'تم إسناد طلب لك.';
    }
    return service
      ? `A request was assigned to you: ${service}.`
      : 'A request was assigned to you.';
  }
  match = text.match(/^تم إسناد طلب(?: جديد)? لك(?:: (.+))?\.?$/);
  if (match) {
    const service = match[1];
    return lang === 'en'
      ? service
        ? `A request was assigned to you: ${service}.`
        : 'A request was assigned to you.'
      : text;
  }

  match = text.match(/^Your request for (.+) was removed by admin\.?$/i);
  if (match) {
    const service = match[1];
    return lang === 'ar'
      ? `تم حذف طلبك لـ ${service} بواسطة الإدارة.`
      : `Your request for ${service} was removed by admin.`;
  }
  match = text.match(/^A request for (.+) was removed by admin\.?$/i);
  if (match) {
    const service = match[1];
    return lang === 'ar'
      ? `تم حذف طلب لخدمة ${service} بواسطة الإدارة.`
      : `A request for ${service} was removed by admin.`;
  }

  return null;
}

function translateStatic(text, lang) {
  const key = TEXT_KEY_BY_VALUE.get(text);
  if (!key) return text;
  const entry = TEXTS[key];
  if (!entry) return text;
  return entry[lang] || text;
}

function translateText(text, lang) {
  if (text === undefined || text === null) return text;
  const normalizedLang = normalizeLang(lang);
  const raw = String(text);
  if (!raw) return raw;
  const statusPhrase = translateStatusPhrase(raw, normalizedLang);
  if (statusPhrase) return statusPhrase;
  const dynamic = translateDynamicText(raw, normalizedLang);
  if (dynamic) return dynamic;
  return translateStatic(raw, normalizedLang);
}

function localizeNotification({ title, body, lang }) {
  const normalizedLang = normalizeLang(lang);
  return {
    title: translateText(title, normalizedLang),
    body: translateText(body, normalizedLang),
    lang: normalizedLang,
  };
}

async function getCustomerLanguage(customerId) {
  if (!customerId) return DEFAULT_LANG;
  const doc = await Customer.findById(customerId).select('settings.language').lean();
  return normalizeLang(doc?.settings?.language);
}

async function getArtisanLanguage(artisanId) {
  if (!artisanId) return DEFAULT_LANG;
  const doc = await Artisan.findById(artisanId).select('settings.language language').lean();
  return normalizeLang(doc?.settings?.language || doc?.language);
}

async function resolveUserLanguage(kind, id) {
  if (kind === 'customer') return getCustomerLanguage(id);
  if (kind === 'artisan') return getArtisanLanguage(id);
  return DEFAULT_LANG;
}

async function localizeForTarget({ kind, id, title, body }) {
  const lang = await resolveUserLanguage(kind, id);
  return localizeNotification({ title, body, lang });
}

module.exports = {
  normalizeLang,
  translateText,
  translateStatus,
  localizeNotification,
  localizeForTarget,
};
