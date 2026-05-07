import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

export function initializeMailer(): void {
  if (!process.env.SMTP_HOST) {
    console.warn('[MAIL] Email service not configured');
    return;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log('[MAIL] Mailer initialized');
}

export async function sendVerificationEmail(
  email: string,
  verificationToken: string
): Promise<void> {
  if (!transporter) {
    throw new Error('Mailer not initialized');
  }

  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?token=${verificationToken}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@st-chat.com',
    to: email,
    subject: 'Verify your ST-Chat email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f0;">Welcome to ST-Chat!</h2>
        <p>Thank you for registering. Please verify your email by clicking the link below:</p>
        <a href="${verificationUrl}" style="background-color: #0f0; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email
        </a>
        <p style="margin-top: 20px; color: #999; font-size: 12px;">
          Or copy this link: ${verificationUrl}
        </p>
        <p style="color: #999; font-size: 12px;">
          This link will expire in 24 hours.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log('[MAIL] Verification email sent to:', email);
}
