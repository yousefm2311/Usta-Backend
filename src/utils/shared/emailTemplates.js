/**
 * Email Templates for Usta App (Bulletproof for Gmail)
 * - Table-based layout (better for Gmail + translation)
 * - Inline CSS (translation breaks <style> often)
 * - RTL Arabic support without relying on Gmail Translate
 */

const appName = "Usta";
const appUrl = process.env.APP_URL || "https://usta.app";
const logoUrl = process.env.LOGO_URL || `${appUrl}/logo.png`;

const primaryColor = "#FF6B35"; // Orange
const secondaryColor = "#004E89"; // Blue
const bgColor = "#f5f5f5";
const cardBg = "#ffffff";
const mutedText = "#6b7280";
const textColor = "#111827";
const borderColor = "#e5e7eb";

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Helpers: inline styles (Gmail-safe)
 */
function baseEmailShell({
  lang = "en",
  dir = "ltr",
  title = "",
  preheader = "",
  bodyHtml = "",
}) {
  // Preheader hidden text (improves inbox preview)
  const safePreheader = escapeHtml(preheader);

  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" content="true" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
  <!-- محاولة لتقليل الترجمة التلقائية (مش مضمونة داخل Gmail) -->
  <meta name="google" content="notranslate" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${bgColor};">
  <!-- Preheader (hidden) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;color:${bgColor};">
    ${safePreheader}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${bgColor};padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">

        <!-- Card -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
          style="width:600px;max-width:600px;background:${cardBg};border-radius:12px;overflow:hidden;border:1px solid ${borderColor};">

          <!-- Header -->
          <tr>
            <td style="padding:24px 20px;background:linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);text-align:center;">
              <!-- <img src="${logoUrl}" alt="${escapeHtml(appName)}" width="120"
               style="display:block;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;height:auto;max-width:120px;" /> -->
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#fff;line-height:1.2;">
                ${escapeHtml(appName)}
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:26px 22px;font-family:Arial,Helvetica,sans-serif;color:${textColor};">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 22px;background:#fafafa;border-top:1px solid ${borderColor};text-align:center;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:12px;line-height:1.6;color:${mutedText};">
                <div style="font-weight:600;color:${textColor};">${escapeHtml(appName)} © ${new Date().getFullYear()}</div>
                <div style="margin-top:8px;">${dir === "rtl" ? "هذه رسالة تلقائية، من فضلك لا تقم بالرد عليها." : "This is an automated email. Please do not reply to this message."}</div>
                <div style="margin-top:10px;">
                  <a href="${appUrl}/privacy" style="color:${primaryColor};text-decoration:none;font-size:12px;margin:0 8px;">${dir === "rtl" ? "الخصوصية" : "Privacy"}</a>
                  <span style="color:${borderColor};">•</span>
                  <a href="${appUrl}/terms" style="color:${primaryColor};text-decoration:none;font-size:12px;margin:0 8px;">${dir === "rtl" ? "الشروط" : "Terms"}</a>
                  <span style="color:${borderColor};">•</span>
                  <a href="${appUrl}/support" style="color:${primaryColor};text-decoration:none;font-size:12px;margin:0 8px;">${dir === "rtl" ? "الدعم" : "Support"}</a>
                </div>
              </div>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function bulletproofButton({ href, text, align = "center" }) {
  // Button using table (Gmail safe)
  return `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px auto 0 auto;" align="${align}">
    <tr>
      <td bgcolor="${primaryColor}" style="border-radius:10px;">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:12px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
          ${escapeHtml(text)}
        </a>
      </td>
    </tr>
  </table>
  `;
}

function codeBox({ code, hint }) {
  const safeCode = escapeHtml(code);
  const safeHint = escapeHtml(hint || "");
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0;">
      <tr>
        <td style="padding:16px;border:2px solid ${primaryColor};border-radius:12px;background:#fff7f3;text-align:center;">
          <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${mutedText};font-weight:700;">
            ${escapeHtml("Code")}
          </div>
          <div style="margin-top:10px;font-size:34px;letter-spacing:6px;font-family:Courier New,monospace;font-weight:800;color:${primaryColor};">
            ${safeCode}
          </div>
          ${safeHint ? `<div style="margin-top:10px;font-size:12px;color:${mutedText};">${safeHint}</div>` : ""}
        </td>
      </tr>
    </table>
  `;
}

function alertBox({ tone = "warn", title, text, dir = "ltr" }) {
  const colors = {
    warn: { bg: "#fff3cd", border: "#f59e0b", text: "#7c5a00" },
    danger: { bg: "#fee2e2", border: "#ef4444", text: "#7f1d1d" },
    info: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  };
  const c = colors[tone] || colors.warn;

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;">
      <tr>
        <td style="padding:14px;border-radius:10px;background:${c.bg};border-${dir === "rtl" ? "right" : "left"}:5px solid ${c.border};">
          <div style="font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:13px;font-weight:800;color:${c.text};margin-bottom:6px;">
              ${escapeHtml(title)}
            </div>
            <div style="font-size:13px;line-height:1.7;color:${c.text};">
              ${escapeHtml(text)}
            </div>
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * ===========================
 * Templates
 * ===========================
 */

/**
 * Verification Code Template (EN/AR)
 */
function verificationCodeTemplate(code, userName = "User", lang = "en") {
  const safeName = escapeHtml(userName);

  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const title = isAr ? "تأكيد البريد الإلكتروني" : "Verify Your Email";
  const preheader = isAr
    ? "رمز تأكيد حسابك داخل تطبيق أستا."
    : "Your verification code for Usta.";

  const body = `
    <div style="font-size:18px;font-weight:800;margin-bottom:10px;color:${textColor};">
      ${isAr ? "🔐 تأكيد الحساب" : "🔐 Verify your account"}
    </div>

    <div style="font-size:14px;line-height:1.8;color:${textColor};margin-bottom:10px;">
      ${isAr ? `مرحبًا <strong style="color:${primaryColor};">${safeName}</strong>،` : `Hello <strong style="color:${primaryColor};">${safeName}</strong>,`}
    </div>

    <div style="font-size:14px;line-height:1.9;color:${mutedText};">
      ${
        isAr
          ? `أهلًا بك في ${appName}. لإكمال إعداد حسابك، استخدم رمز التحقق التالي:`
          : `Welcome to ${appName}! To complete your setup, please use the verification code below:`
      }
    </div>

    ${codeBox({
      code,
      hint: isAr ? "ينتهي خلال ساعتين" : "Expires in 2 hours",
    })}

    <div style="font-size:14px;line-height:1.9;color:${mutedText};margin-top:8px;">
      ${
        isAr
          ? "أدخل هذا الرمز داخل تطبيق أستا. إذا لم تطلب هذا الرمز، تجاهل الرسالة."
          : "Enter this code in the Usta app. If you didn’t request it, please ignore this email."
      }
    </div>

    ${alertBox({
      tone: "warn",
      title: isAr ? "نصيحة أمان" : "Security tip",
      text: isAr
        ? "لا تشارك رمز التحقق مع أي شخص. فريق أستا لن يطلبه منك أبدًا."
        : "Never share this code with anyone. Usta staff will never ask for it.",
      dir,
    })}

    <div style="margin-top:14px;font-size:14px;line-height:1.9;color:${mutedText};">
      ${
        isAr
          ? "لو احتجت مساعدة، تقدر تتواصل مع الدعم."
          : "If you need help, feel free to contact support."
      }
    </div>

    ${bulletproofButton({
      href: `${appUrl}/support`,
      text: isAr ? "الدعم" : "Contact Support",
      align: "center",
    })}
  `;

  return baseEmailShell({
    lang: isAr ? "ar" : "en",
    dir,
    title,
    preheader,
    bodyHtml: body,
  });
}

/**
 * Password Reset Template (EN/AR)
 */
function passwordResetTemplate(code, userName = "User", lang = "en") {
  const safeName = escapeHtml(userName);
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const title = isAr ? "إعادة تعيين كلمة المرور" : "Reset Your Password";
  const preheader = isAr
    ? "رمز إعادة تعيين كلمة المرور داخل تطبيق أستا."
    : "Your password reset code for Usta.";

  const body = `
    <div style="font-size:18px;font-weight:800;margin-bottom:10px;color:${textColor};">
      ${isAr ? "🔑 إعادة تعيين كلمة المرور" : "🔑 Reset your password"}
    </div>

    <div style="font-size:14px;line-height:1.8;color:${textColor};margin-bottom:10px;">
      ${isAr ? `مرحبًا <strong style="color:${primaryColor};">${safeName}</strong>،` : `Hi <strong style="color:${primaryColor};">${safeName}</strong>,`}
    </div>

    <div style="font-size:14px;line-height:1.9;color:${mutedText};">
      ${
        isAr
          ? `وصلنا طلب لإعادة تعيين كلمة مرور ${appName}. استخدم الرمز التالي:`
          : `We received a request to reset your ${appName} password. Use the code below:`
      }
    </div>

    ${codeBox({
      code,
      hint: isAr ? "ينتهي خلال ساعتين" : "Expires in 2 hours",
    })}

    ${alertBox({
      tone: "danger",
      title: isAr ? "مهم" : "Important",
      text: isAr
        ? "إذا لم تطلب إعادة تعيين كلمة المرور، تواصل مع الدعم فورًا."
        : "If you didn’t request this, please contact support immediately.",
      dir,
    })}

    <div style="margin-top:14px;font-size:14px;line-height:1.9;color:${mutedText};">
      ${
        isAr
          ? "الخطوات: أدخل الرمز، ثم اختر كلمة مرور قوية، ثم أكدها."
          : "Steps: enter the code, create a strong password, then confirm it."
      }
    </div>

    ${bulletproofButton({
      href: `${appUrl}/support`,
      text: isAr ? "تواصل مع الدعم" : "Contact Support",
      align: "center",
    })}
  `;

  return baseEmailShell({
    lang: isAr ? "ar" : "en",
    dir,
    title,
    preheader,
    bodyHtml: body,
  });
}

/**
 * Welcome Template (EN/AR) + userType (customer/artisan)
 */
function welcomeTemplate(
  userName = "User",
  userType = "customer",
  lang = "en",
) {
  const safeName = escapeHtml(userName);
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const isArtisan = userType === "artisan";

  const title = isAr ? "مرحبًا بك في أستا" : `Welcome to ${appName}`;
  const preheader = isAr
    ? "ابدأ رحلتك مع أستا الآن."
    : "Get started with Usta.";

  // FIXED: template string
  const welcomeMessage = isArtisan
    ? isAr
      ? `مرحبًا بك في مجتمع ${appName} للحرفيين المحترفين!`
      : `Welcome to the ${appName} community of skilled professionals!`
    : isAr
      ? `مرحبًا بك في ${appName} — مكانك الموثوق للخدمات!`
      : `Welcome to ${appName} — your trusted marketplace for quality services!`;

  const featureRows = isArtisan
    ? [
        {
          icon: "⭐",
          title: isAr ? "ابنِ ملفك" : "Build your profile",
          desc: isAr ? "أضف مهاراتك وتسعيرك" : "Add skills and pricing",
        },
        {
          icon: "💼",
          title: isAr ? "استقبل الطلبات" : "Get requests",
          desc: isAr ? "طلبات من العملاء بسهولة" : "Receive customer requests",
        },
        {
          icon: "💬",
          title: isAr ? "تواصل سريع" : "Fast chat",
          desc: isAr ? "تواصل مباشر مع العملاء" : "Chat with customers",
        },
        {
          icon: "📈",
          title: isAr ? "كبر شغلك" : "Grow",
          desc: isAr ? "ابنِ سمعتك وزود دخلك" : "Build reputation & earnings",
        },
      ]
    : [
        {
          icon: "🔍",
          title: isAr ? "ابحث بسهولة" : "Find services",
          desc: isAr ? "اختار الحرفي المناسب" : "Browse professionals",
        },
        {
          icon: "⭐",
          title: isAr ? "شوف التقييمات" : "Read reviews",
          desc: isAr ? "تجارب الناس قبل كده" : "See ratings & feedback",
        },
        {
          icon: "📝",
          title: isAr ? "اطلب الخدمة" : "Request",
          desc: isAr ? "اطلب في دقائق" : "Request in minutes",
        },
        {
          icon: "💬",
          title: isAr ? "اتكلم مباشرة" : "Chat",
          desc: isAr ? "اسأل واتفق قبل التنفيذ" : "Discuss before work",
        },
      ];

  const featuresTable = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
      <tr>
        <td style="padding:0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${featureRows
              .map(
                (f) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid ${borderColor};">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td width="44" valign="top" style="font-size:22px;line-height:1;padding-${dir === "rtl" ? "left" : "right"}:10px;">
                        ${f.icon}
                      </td>
                      <td valign="top" style="font-family:Arial,Helvetica,sans-serif;">
                        <div style="font-size:14px;font-weight:800;color:${textColor};margin-bottom:2px;">
                          ${escapeHtml(f.title)}
                        </div>
                        <div style="font-size:13px;line-height:1.7;color:${mutedText};">
                          ${escapeHtml(f.desc)}
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`,
              )
              .join("")}
          </table>
        </td>
      </tr>
    </table>
  `;

  const ctaText = isArtisan
    ? isAr
      ? "كمّل بياناتك"
      : "Complete Your Profile"
    : isAr
      ? "ابدأ التصفح"
      : "Start Exploring";

  const ctaLink = isArtisan
    ? `${appUrl}/getting-started?type=artisan`
    : `${appUrl}/getting-started?type=customer`;

  const body = `
    <div style="font-size:20px;font-weight:900;margin-bottom:8px;color:${textColor};">
      🎉 ${isAr ? "مرحبًا بك!" : "Welcome!"}
    </div>

    <div style="font-size:14px;line-height:1.9;color:${textColor};margin-bottom:10px;">
      ${isAr ? `أهلًا <strong style="color:${primaryColor};">${safeName}</strong>،` : `Hello <strong style="color:${primaryColor};">${safeName}</strong>,`}
    </div>

    <div style="font-size:14px;line-height:1.9;color:${mutedText};">
      ${escapeHtml(welcomeMessage)}
    </div>

    ${featuresTable}

    ${bulletproofButton({ href: ctaLink, text: ctaText, align: "center" })}

    <div style="margin-top:14px;font-size:13px;line-height:1.9;color:${mutedText};">
      ${isAr ? "لو عندك أي سؤال، الدعم موجود دائمًا." : "If you have any questions, our support team is here to help."}
    </div>
  `;

  return baseEmailShell({
    lang: isAr ? "ar" : "en",
    dir,
    title,
    preheader,
    bodyHtml: body,
  });
}

/**
 * Exports
 */
module.exports = {
  verificationCodeTemplate,
  passwordResetTemplate,
  welcomeTemplate,
};
