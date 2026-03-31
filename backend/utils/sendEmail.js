const { Resend } = require('resend');
require('dotenv').config();

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }

  return new Resend(process.env.RESEND_API_KEY);
}

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || 'Crypto Portfolio <onboarding@resend.dev>';
}

async function sendEmail({ to, subject, html }) {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: [to],
    subject,
    html
  });

  if (error) {
    throw new Error(error.message || 'Resend send failed');
  }

  return data;
}

const sendResetEmail = async (toEmail, resetToken, userName, baseUrl) => {
  const base = baseUrl || process.env.FRONTEND_URL || 'http://127.0.0.1:5500';
  const resetLink = `${base}/pages/reset-password.html?token=${resetToken}`;

  await sendEmail({
    to: toEmail,
    subject: 'Reset Your Password - Crypto Portfolio',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #ffffff; padding: 40px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00e5ff; font-size: 28px;">Crypto Portfolio</h1>
        </div>
        <h2 style="color: #ffffff;">Hi ${userName},</h2>
        <p style="color: #a0aec0; font-size: 16px;">We received a request to reset your password. Click the button below to create a new password.</p>
        <div style="text-align: center; margin: 35px 0;">
          <a href="${resetLink}" style="background: linear-gradient(135deg, #00e5ff, #7b2ff7); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #a0aec0; font-size: 14px;">This link expires in <strong style="color: #00e5ff;">1 hour</strong>.</p>
        <p style="color: #a0aec0; font-size: 14px;">If you did not request this, ignore this email and your password will stay unchanged.</p>
      </div>
    `
  });
};

const sendAlertEmail = async (toEmail, userName, alertData) => {
  const { coinName, symbol, condition, targetPrice, currentPrice, alertLink } = alertData;
  const directionWord = condition === 'above' ? 'gone above' : 'gone below';
  const formattedTarget = Number(targetPrice).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const formattedCurrent = Number(currentPrice).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  await sendEmail({
    to: toEmail,
    subject: `Alert Triggered: ${coinName} (${symbol}) has ${directionWord} ${formattedTarget}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #ffffff; padding: 40px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00e5ff; font-size: 28px;">Crypto Portfolio</h1>
        </div>
        <h2 style="color: #ffffff;">Hi ${userName},</h2>
        <p style="color: #a0aec0; font-size: 15px; line-height: 1.7;">Your alert for ${coinName} (${symbol}) has been triggered.</p>
        <p style="color: #a0aec0; font-size: 15px;">Target price: <strong style="color: #00e5ff;">${formattedTarget}</strong></p>
        <p style="color: #a0aec0; font-size: 15px;">Current price: <strong style="color: #00ff9c;">${formattedCurrent}</strong></p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${alertLink}" style="background: linear-gradient(135deg, #00e5ff, #7b2ff7); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: bold;">View My Alerts</a>
        </div>
      </div>
    `
  });
};

const sendNewsletterEmail = async (toEmail) => {
  const newsUrl = `${process.env.FRONTEND_URL || 'http://127.0.0.1:5500'}/pages/news.html`;

  await sendEmail({
    to: toEmail,
    subject: 'Welcome to Daily Crypto Digest!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #ffffff; padding: 40px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00e5ff; font-size: 28px;">Crypto Portfolio</h1>
        </div>
        <p style="color: #a0aec0; font-size: 14px; line-height: 1.7;">Thanks for subscribing to Daily Crypto Digest.</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${newsUrl}" style="background: linear-gradient(135deg, #00e5ff, #7b2ff7); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: bold;">Read Today's News</a>
        </div>
      </div>
    `
  });
};

module.exports = { sendResetEmail, sendAlertEmail, sendNewsletterEmail };
