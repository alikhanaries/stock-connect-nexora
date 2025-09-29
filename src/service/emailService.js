import { defaultMailOptions, transporter, mailBranding } from '../config/emailConfig.js';
import { importProductConstant, resetPasswordConstants } from '../constants/emailConstants.js';
import { productImportTemplate } from '../emailTemplates/importProductTemplate.js';
import { resetPasswordTemplate } from '../emailTemplates/resetPasswordTemplate.js';

const sendMail = async ({ to, subject, html }) => {
  try {
    if (!to || !subject || !html) {
      throw new Error('Missing required email fields: to, subject, or html');
    }

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

const importProductMailService = async ({ to, importStatus = 'SUCCESS', errorDetails = [], userName }) => {
  try {
    const mailOptions = {
      to,
      subject: 'Product Import Notification',
      html: productImportTemplate({
        importStatus,
        errorDetails,
        ...importProductConstant,
        ...mailBranding,
        PRODUCT_IMPORT_HELLO: `Hello ${userName},`,
      }),
    };

    const { success, messageId } = await sendMail(mailOptions);
    return { success, messageId };
  } catch (error) {
    console.error('Mail error (Product Import):', error.message);
    return { success: false, error: error.message };
  }
};

const resetPasswordService = async ({ to, userName, resetUrl }) => {
  try {
    const mailOptions = {
      to,
      subject: `${mailBranding.tenantName} - ${resetPasswordConstants.RESET_PASSWORD_TITLE}`,
      html: resetPasswordTemplate({
        userName: userName || 'User',
        resetUrl,
        ...mailBranding,
        ...resetPasswordConstants,
      }),
    };

    const { success, messageId } = await sendMail(mailOptions);
    return { success, messageId };
  } catch (error) {
    console.error('Mail error (Reset Password):', error.message);
    return { success: false, error: error.message };
  }
};

export default { sendMail, importProductMailService, resetPasswordService };
