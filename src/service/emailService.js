import { defaultMailOptions, transporter } from '../config/emailConfig.js';

const sendMail = async ({ to, subject, html }) => {
  try {
    const mailOptions = {
      ...defaultMailOptions,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('SES Email error:', error);
    return { success: false, error };
  }
};

export default { sendMail };
