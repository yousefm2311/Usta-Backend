/**
 * Email Templates for Usta App
 * Provides beautiful HTML email templates
 */

const appName = 'Usta';
const appUrl = process.env.APP_URL || 'https://usta.app';
const logoUrl = process.env.LOGO_URL || `${appUrl}/logo.png`;
const primaryColor = '#FF6B35'; // Orange
const secondaryColor = '#004E89'; // Blue

/**
 * Verification Code Template
 */
function verificationCodeTemplate(code, userName = 'User') {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f5f5f5;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
          padding: 30px 20px;
          text-align: center;
          color: white;
        }
        .header img {
          max-height: 50px;
          margin-bottom: 15px;
        }
        .header h1 {
          font-size: 28px;
          margin-bottom: 5px;
        }
        .content {
          padding: 40px 30px;
        }
        .greeting {
          font-size: 16px;
          color: #333;
          margin-bottom: 20px;
        }
        .greeting strong {
          color: ${primaryColor};
        }
        .message {
          font-size: 15px;
          color: #666;
          line-height: 1.6;
          margin-bottom: 30px;
        }
        .code-box {
          background-color: #f9f9f9;
          border: 2px solid ${primaryColor};
          border-radius: 8px;
          padding: 25px;
          text-align: center;
          margin: 30px 0;
        }
        .code-label {
          font-size: 12px;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        .code {
          font-size: 36px;
          font-weight: bold;
          color: ${primaryColor};
          letter-spacing: 5px;
          font-family: 'Courier New', monospace;
        }
        .code-hint {
          font-size: 12px;
          color: #999;
          margin-top: 10px;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          background-color: ${primaryColor};
          color: white;
          padding: 12px 30px;
          border-radius: 5px;
          text-decoration: none;
          font-size: 14px;
          font-weight: bold;
          transition: background-color 0.3s;
        }
        .button:hover {
          background-color: ${secondaryColor};
        }
        .footer {
          background-color: #f9f9f9;
          padding: 20px 30px;
          text-align: center;
          border-top: 1px solid #eee;
        }
        .footer-text {
          font-size: 12px;
          color: #999;
          line-height: 1.6;
        }
        .footer-links {
          margin-top: 10px;
        }
        .footer-links a {
          color: ${primaryColor};
          text-decoration: none;
          margin: 0 10px;
          font-size: 12px;
        }
        .divider {
          height: 1px;
          background-color: #eee;
          margin: 20px 0;
        }
        .warning {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          font-size: 13px;
          color: #856404;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1>🔐 ${appName}</h1>
          <p>Verify Your Account</p>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="greeting">
            Hello <strong>${userName}</strong>,
          </div>

          <div class="message">
            Welcome to ${appName}! To complete your account setup and ensure your security, please verify your email address using the code below.
          </div>

          <!-- Verification Code -->
          <div class="code-box">
            <div class="code-label">Your Verification Code</div>
            <div class="code">${code}</div>
            <div class="code-hint">This code expires in 2 hours</div>
          </div>

          <div class="message">
            Enter this code in your ${appName} app to verify your email address. If you didn't request this code, please ignore this email.
          </div>

          <div class="warning">
            <strong>⚠️ Security Tip:</strong> Never share your verification code with anyone. ${appName} staff will never ask for this code.
          </div>

          <div class="message">
            If you need any assistance, please don't hesitate to reach out to our support team.
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-text">
            <p>${appName} © ${new Date().getFullYear()}</p>
            <div class="divider"></div>
            <p>This is an automated email. Please do not reply directly to this message.</p>
            <div class="footer-links">
              <a href="${appUrl}/privacy">Privacy Policy</a>
              <a href="${appUrl}/terms">Terms of Service</a>
              <a href="${appUrl}/support">Help Center</a>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Password Reset Template
 */
function passwordResetTemplate(code, userName = 'User') {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f5f5f5;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
          padding: 30px 20px;
          text-align: center;
          color: white;
        }
        .header h1 {
          font-size: 28px;
          margin-bottom: 5px;
        }
        .content {
          padding: 40px 30px;
        }
        .greeting {
          font-size: 16px;
          color: #333;
          margin-bottom: 20px;
        }
        .greeting strong {
          color: #e74c3c;
        }
        .message {
          font-size: 15px;
          color: #666;
          line-height: 1.6;
          margin-bottom: 30px;
        }
        .code-box {
          background-color: #f9f9f9;
          border: 2px solid #e74c3c;
          border-radius: 8px;
          padding: 25px;
          text-align: center;
          margin: 30px 0;
        }
        .code-label {
          font-size: 12px;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        .code {
          font-size: 36px;
          font-weight: bold;
          color: #e74c3c;
          letter-spacing: 5px;
          font-family: 'Courier New', monospace;
        }
        .code-hint {
          font-size: 12px;
          color: #999;
          margin-top: 10px;
        }
        .warning {
          background-color: #fee;
          border-left: 4px solid #e74c3c;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          font-size: 13px;
          color: #c0392b;
        }
        .footer {
          background-color: #f9f9f9;
          padding: 20px 30px;
          text-align: center;
          border-top: 1px solid #eee;
        }
        .footer-text {
          font-size: 12px;
          color: #999;
          line-height: 1.6;
        }
        .footer-links {
          margin-top: 10px;
        }
        .footer-links a {
          color: #e74c3c;
          text-decoration: none;
          margin: 0 10px;
          font-size: 12px;
        }
        .divider {
          height: 1px;
          background-color: #eee;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1>🔑 Reset Your Password</h1>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="greeting">
            Hi <strong>${userName}</strong>,
          </div>

          <div class="message">
            We received a request to reset your ${appName} password. Use the code below to create a new password.
          </div>

          <!-- Reset Code -->
          <div class="code-box">
            <div class="code-label">Your Reset Code</div>
            <div class="code">${code}</div>
            <div class="code-hint">This code expires in 2 hours</div>
          </div>

          <div class="warning">
            <strong>🔒 Important:</strong> If you didn't request this password reset, please secure your account immediately by contacting our support team.
          </div>

          <div class="message">
            Steps to reset your password:
            <ol style="margin-left: 20px; margin-top: 10px;">
              <li>Enter the code above in the password reset form</li>
              <li>Create a strong new password</li>
              <li>Confirm your new password</li>
            </ol>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-text">
            <p>${appName} © ${new Date().getFullYear()}</p>
            <div class="divider"></div>
            <p>This is a security-related email. Please do not forward it to others.</p>
            <div class="footer-links">
              <a href="${appUrl}/privacy">Privacy Policy</a>
              <a href="${appUrl}/terms">Terms of Service</a>
              <a href="${appUrl}/support">Help Center</a>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Welcome Template
 */
function welcomeTemplate(userName = 'User', userType = 'customer') {
  const isArtisan = userType === 'artisan';
  const welcomeMessage = isArtisan 
    ? 'Welcome to the ${appName} community of skilled professionals!'
    : 'Welcome to ${appName} - Your trusted marketplace for quality services!';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f5f5f5;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
          padding: 40px 20px;
          text-align: center;
          color: white;
        }
        .header h1 {
          font-size: 32px;
          margin-bottom: 10px;
        }
        .header p {
          font-size: 16px;
          opacity: 0.9;
        }
        .content {
          padding: 40px 30px;
        }
        .greeting {
          font-size: 18px;
          color: #333;
          margin-bottom: 20px;
        }
        .greeting strong {
          color: ${primaryColor};
        }
        .features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin: 30px 0;
        }
        .feature {
          padding: 15px;
          background-color: #f9f9f9;
          border-radius: 6px;
          border-left: 4px solid ${primaryColor};
        }
        .feature-icon {
          font-size: 24px;
          margin-bottom: 8px;
        }
        .feature-title {
          font-size: 14px;
          font-weight: bold;
          color: #333;
          margin-bottom: 5px;
        }
        .feature-desc {
          font-size: 12px;
          color: #666;
        }
        .cta-button {
          display: inline-block;
          background-color: ${primaryColor};
          color: white;
          padding: 14px 35px;
          border-radius: 5px;
          text-decoration: none;
          font-size: 14px;
          font-weight: bold;
          margin: 20px 0;
          transition: background-color 0.3s;
        }
        .cta-button:hover {
          background-color: ${secondaryColor};
        }
        .footer {
          background-color: #f9f9f9;
          padding: 20px 30px;
          text-align: center;
          border-top: 1px solid #eee;
        }
        .footer-text {
          font-size: 12px;
          color: #999;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1>🎉 Welcome to ${appName}!</h1>
          <p>${welcomeMessage}</p>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="greeting">
            Hello <strong>${userName}</strong>,
          </div>

          <p style="font-size: 15px; color: #666; line-height: 1.6; margin-bottom: 20px;">
            Thank you for joining ${appName}. We're excited to have you on board! 
            ${isArtisan 
              ? 'Showcase your skills, connect with customers, and grow your business.' 
              : 'Find trusted professionals for all your service needs in one place.'}
          </p>

          <div class="features">
            ${isArtisan ? `
              <div class="feature">
                <div class="feature-icon">⭐</div>
                <div class="feature-title">Build Your Profile</div>
                <div class="feature-desc">Add your skills, portfolio, and pricing</div>
              </div>
              <div class="feature">
                <div class="feature-icon">💼</div>
                <div class="feature-title">Get Requests</div>
                <div class="feature-desc">Receive service requests from customers</div>
              </div>
              <div class="feature">
                <div class="feature-icon">💰</div>
                <div class="feature-title">Earn Money</div>
                <div class="feature-desc">Get paid securely for your work</div>
              </div>
              <div class="feature">
                <div class="feature-icon">📈</div>
                <div class="feature-title">Grow Your Business</div>
                <div class="feature-desc">Build your reputation and customer base</div>
              </div>
            ` : `
              <div class="feature">
                <div class="feature-icon">🔍</div>
                <div class="feature-title">Find Services</div>
                <div class="feature-desc">Browse skilled professionals</div>
              </div>
              <div class="feature">
                <div class="feature-icon">⭐</div>
                <div class="feature-title">Read Reviews</div>
                <div class="feature-desc">See ratings and customer feedback</div>
              </div>
              <div class="feature">
                <div class="feature-icon">📝</div>
                <div class="feature-title">Book Services</div>
                <div class="feature-desc">Request and schedule work easily</div>
              </div>
              <div class="feature">
                <div class="feature-icon">🤝</div>
                <div class="feature-title">Chat Directly</div>
                <div class="feature-desc">Communicate with professionals</div>
              </div>
            `}
          </div>

          <p style="text-align: center;">
            <a href="${appUrl}/getting-started" class="cta-button">
              ${isArtisan ? 'Complete Your Profile' : 'Start Exploring'}
            </a>
          </p>

          <p style="font-size: 13px; color: #999; margin-top: 20px;">
            If you have any questions, our support team is here to help!
          </p>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-text">
            <p>${appName} © ${new Date().getFullYear()}</p>
            <p style="margin-top: 10px;">
              <a href="${appUrl}/privacy" style="color: ${primaryColor}; text-decoration: none;">Privacy</a> • 
              <a href="${appUrl}/terms" style="color: ${primaryColor}; text-decoration: none;">Terms</a> • 
              <a href="${appUrl}/support" style="color: ${primaryColor}; text-decoration: none;">Support</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  verificationCodeTemplate,
  passwordResetTemplate,
  welcomeTemplate,
};
