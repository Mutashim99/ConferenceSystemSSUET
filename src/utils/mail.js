import nodemailer from 'nodemailer';

/**
 * Creates a reusable nodemailer transporter.
 * Uses SMTP credentials from environment variables.
 */
const createTransporter = () => {
  // Check if all required env variables are set
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('Email service is not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');
    // We'll return null and let the sendEmail function handle this
    return null;
  }

  // Use real credentials from .env
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: (process.env.SMTP_PORT === '465'), // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER, // Your aribmohsin7@gmail.com
      pass: process.env.SMTP_PASS, // Your app password
    },
  });
};

/**
 * Sends an email.
 * @param {string} to - Recipient's email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} html - HTML body
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      console.error('Email transporter is not available. Check .env variables. Skipping email.');
      return; // Don't crash the app, just log the error
    }

    const fromName = process.env.EMAIL_FROM || 'Conference Admin';
    const fromEmail = process.env.SMTP_USER; // The email you are sending from

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: to,
      subject: subject,
      text: text,
      html: html,
    });

    console.log('Message sent: %s', info.messageId);

    // Ethereal preview is no longer used
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't crash the app, just log the error
  }
};

