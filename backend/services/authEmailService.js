const { Resend } = require('resend');

const getFrontendBaseUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';
const getEmailFrom = () => process.env.EMAIL_FROM || '';
const getResendApiKey = () => process.env.RESEND_API_KEY || '';

const hasResendConfig = () => Boolean(getResendApiKey() && getEmailFrom());

const getResendClient = () => new Resend(getResendApiKey());

const buildActionLink = (action, token) =>
  `${getFrontendBaseUrl()}/?authAction=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}`;

const buildEmailCopy = ({ type, user, link }) => {
  if (type === 'email-verification') {
    return {
      subject: 'Verify your GradHunt email',
      text: [
        `Hi ${user.name || 'there'},`,
        '',
        'Thanks for creating your GradHunt account.',
        'Please verify your email address by opening the link below:',
        link,
        '',
        'If you did not create this account, you can ignore this email.',
      ].join('\n'),
      html: `
        <div style="font-family: Arial, sans-serif; color: #22223b; line-height: 1.6;">
          <h2 style="margin-bottom: 12px;">Verify your GradHunt email</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Thanks for creating your GradHunt account.</p>
          <p>Please verify your email address by clicking the button below:</p>
          <p style="margin: 24px 0;">
            <a
              href="${link}"
              style="background: #22223b; color: #f2e9e4; text-decoration: none; padding: 12px 18px; border-radius: 999px; display: inline-block;"
            >
              Verify email
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p><a href="${link}">${link}</a></p>
          <p>If you did not create this account, you can ignore this email.</p>
        </div>
      `,
    };
  }

  return {
    subject: 'Reset your GradHunt password',
    text: [
      `Hi ${user.name || 'there'},`,
      '',
      'We received a request to reset your GradHunt password.',
      'Open the link below to choose a new password:',
      link,
      '',
      'If you did not request this change, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #22223b; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">Reset your GradHunt password</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>We received a request to reset your GradHunt password.</p>
        <p>Click the button below to choose a new password:</p>
        <p style="margin: 24px 0;">
          <a
            href="${link}"
            style="background: #4a4e69; color: #f2e9e4; text-decoration: none; padding: 12px 18px; border-radius: 999px; display: inline-block;"
          >
            Reset password
          </a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${link}">${link}</a></p>
        <p>If you did not request this change, you can ignore this email.</p>
      </div>
    `,
  };
};

const deliverAuthEmail = async ({ type, user, token }) => {
  const action = type === 'email-verification' ? 'verify-email' : 'reset-password';
  const link = buildActionLink(action, token);
  const emailCopy = buildEmailCopy({ type, user, link });

  if (!hasResendConfig()) {
    console.warn(`[GradHunt email] Missing Resend config. Falling back to local preview link for ${user.email}: ${link}`);
    return {
      delivery: 'console',
      previewLink: link,
    };
  }

  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: getEmailFrom(),
    to: [user.email],
    subject: emailCopy.subject,
    text: emailCopy.text,
    html: emailCopy.html,
  });

  if (error) {
    console.error('Resend email error:', error);
    throw new Error(error.message || 'Failed to send email.');
  }

  return {
    delivery: 'provider',
    provider: 'resend',
    messageId: data?.id || null,
    previewLink: process.env.NODE_ENV === 'production' ? undefined : link,
  };
};

module.exports = {
  buildActionLink,
  deliverAuthEmail,
};
