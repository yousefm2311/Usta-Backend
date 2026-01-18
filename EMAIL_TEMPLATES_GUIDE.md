# 📧 Email Templates Guide - Usta Backend

## نظرة عامة
تم تحسين نظام إرسال البريد الإلكتروني في التطبيق بإضافة templates HTML احترافية وجميلة.

## 📁 الملفات الرئيسية

### 1. `src/utils/shared/emailTemplates.js`
ملف يحتوي على جميع templates البريد الإلكتروني:
- ✅ `verificationCodeTemplate()` - للتحقق من البريد
- ✅ `passwordResetTemplate()` - لإعادة تعيين كلمة المرور
- ✅ `welcomeTemplate()` - لرسالة الترحيب

### 2. `src/controllers/artisan/artisan.controller.js`
استخدام التمبليتات في:
- `signup()` - إرسال كود التحقق عند التسجيل
- `login()` - إعادة إرسال كود التحقق
- `resendVerification()` - إعادة إرسال كود التحقق
- `forgotPassword()` - إرسال كود إعادة تعيين كلمة المرور

### 3. `src/controllers/customer/customer.controller.js`
نفس الاستخدام مع العملاء

---

## 🎨 تفاصيل التمبليتات

### 1️⃣ Verification Code Template

**الاستخدام:**
```javascript
const htmlContent = verificationCodeTemplate(code, userName);
await sendMail(email, 'Verify your Usta account', htmlContent);
```

**المميزات:**
- ✨ تصميم حديث مع gradient
- 🔐 رسالة أمان واضحة
- ⏱️ وقت انتهاء الصلاحية (48 ساعة)
- 🎯 كود التحقق مبرز بشكل واضح
- 📱 responsive على جميع الأجهزة

**الألوان:**
- Primary Color: `#FF6B35` (برتقالي)
- Secondary Color: `#004E89` (أزرق)

---

### 2️⃣ Password Reset Template

**الاستخدام:**
```javascript
const htmlContent = passwordResetTemplate(code, userName);
await sendMail(email, 'Reset your Usta password', htmlContent);
```

**المميزات:**
- 🔴 لون مختلف للتمييز (أحمر)
- ⚠️ تحذير أمني واضح
- ⏱️ وقت انتهاء الصلاحية (ساعتان)
- 📋 خطوات واضحة للمستخدم
- 🛡️ تأكيد أمني قوي

---

### 3️⃣ Welcome Template

**الاستخدام:**
```javascript
const htmlContent = welcomeTemplate(userName, 'customer'); // أو 'artisan'
await sendMail(email, 'Welcome to Usta!', htmlContent);
```

**المميزات:**
- 🎉 رسالة ترحيبية احترافية
- 🎯 محتوى مخصص للعملاء والحرفيين
- ✨ بطاقات feature مع icons
- 🔗 روابط مهمة (Privacy, Terms, Support)
- 📱 تصميم responsive

---

## ⚙️ متغيرات التكوين

تأكد من وجود هذه المتغيرات في ملف `.env`:

```env
# Gmail SMTP Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@gmail.com
SMTP_PASS=YOUR_GMAIL_APP_PASSWORD
MAIL_FROM=your@gmail.com
MAIL_FROM_NAME=Usta

# App URLs
APP_URL=https://usta.app
LOGO_URL=https://usta.app/logo.png
```

---

## 🔧 كيفية التخصيص

### تغيير الألوان:
```javascript
// في emailTemplates.js
const primaryColor = '#FF6B35'; // غيّر هنا
const secondaryColor = '#004E89'; // غيّر هنا
```

### تغيير أسماء التطبيق:
```javascript
const appName = 'Usta'; // غيّر هنا
const appUrl = process.env.APP_URL || 'https://usta.app';
const logoUrl = process.env.LOGO_URL || `${appUrl}/logo.png`;
```

### إضافة template جديد:
```javascript
function myNewTemplate(code, userName) {
  return `
    <!DOCTYPE html>
    <html>
      <!-- HTML content here -->
    </html>
  `;
}

module.exports = {
  verificationCodeTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  myNewTemplate, // أضف هنا
};
```

---

## 📊 جدول الاستخدام

| الدالة | الملف | الحدث | الـ Template |
|-------|------|-------|------------|
| `signup()` | artisan/artisan.controller.js | تسجيل جديد | verificationCodeTemplate |
| `login()` | artisan/artisan.controller.js | تسجيل دخول غير مُتحقق | verificationCodeTemplate |
| `resendVerification()` | artisan/artisan.controller.js | إعادة إرسال | verificationCodeTemplate |
| `forgotPassword()` | artisan/artisan.controller.js | نسيان كلمة المرور | passwordResetTemplate |
| `signup()` | customer/customer.controller.js | تسجيل جديد | verificationCodeTemplate |
| `login()` | customer/customer.controller.js | تسجيل دخول غير مُتحقق | verificationCodeTemplate |
| `forgotPassword()` | customer/customer.controller.js | نسيان كلمة المرور | passwordResetTemplate |

---

## 🧪 الاختبار

### اختبار يدوي:
1. انتقل إلى ملف `emailTemplates.js`
2. استدعِ الدالة مع بيانات تجريبية
3. انسخ HTML الناتج وافتحه في المتصفح

```javascript
// مثال
const html = verificationCodeTemplate('123456', 'أحمد');
console.log(html);
```

### اختبار مع Gmail:
1. تأكد من `.env` الصحيح
2. قم بتسجيل حساب جديد
3. تحقق من البريد الوارد

---

## 🐛 استكشاف الأخطاء

### لا تصل الرسائل:
```
❌ تحقق من بيانات SMTP في .env
❌ استخدم App Password (ليس كلمة المرور العادية) في Gmail
❌ تأكد من تفعيل "Less secure app access" أو استخدام 2FA
```

### الرسالة لا تظهر صحيحة:
```
❌ قد تحجب بعض عملاء البريد بعض الـ CSS
❌ اختبر على عملاء مختلفة (Gmail, Outlook, etc)
❌ تحقق من حجم الصور والـ SVG
```

### الأكواد لا تظهر صحيحة:
```
❌ تأكد من تمرير الـ code و userName بشكل صحيح
❌ تحقق من أن الـ code بصيغة string
```

---

## 📞 الدعم والمساعدة

إذا واجهت مشاكل:
1. تحقق من logs التطبيق
2. تأكد من متغيرات البيئة
3. اختبر SMTP connection مباشرة
4. راجع Nodemailer documentation

---

## ✅ القائمة التحققية

- [ ] تحديث `.env` بقيم SMTP الصحيحة
- [ ] استخدام App Password من Gmail
- [ ] اختبار الـ signup والـ login
- [ ] التحقق من وصول الرسائل
- [ ] تخصيص الألوان والعلامات التجارية
- [ ] اختبار على عملاء بريد مختلفة

---

**آخر تحديث:** نوفمبر 2025
**المسؤول:** Usta Backend Team


