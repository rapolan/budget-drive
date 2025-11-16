import nodemailer from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    email: string;
  };
}

export function getEmailConfig(): EmailConfig {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    from: {
      name: process.env.SMTP_FROM_NAME || 'Budget Driving School',
      email: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@budgetdrive.com',
    },
  };
}

export function createEmailTransporter() {
  const config = getEmailConfig();

  // Validate configuration
  if (!config.auth.user || !config.auth.pass) {
    console.warn('⚠️  Email configuration incomplete. Set SMTP_USER and SMTP_PASS in .env file.');
    console.warn('⚠️  Emails will not be sent until configuration is complete.');
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
}

export async function verifyEmailConnection(): Promise<boolean> {
  try {
    const transporter = createEmailTransporter();
    await transporter.verify();
    console.log('✅ Email server connection verified successfully');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error);
    console.error('💡 Check your SMTP credentials in .env file');
    return false;
  }
}
