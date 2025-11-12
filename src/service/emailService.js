import { defaultMailOptions, transporter, mailBranding } from '../config/emailConfig.js';
import { importProductConstant, resetPasswordConstants } from '../constants/emailConstants.js';
import { productImportTemplate } from '../emailTemplates/importProductTemplate.js';
import { resetPasswordTemplate } from '../emailTemplates/resetPasswordTemplate.js';

const sendEmailMessage = async ({ to, subject, html }) => {
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

    console.log('Email message sent:', info);

    return {
      success: true,
      messageId: info?.messageId,
      response: info?.response || 'Mail accepted by transporter',
    };
  } catch (error) {
    console.error('Email sending failed:', error.message);
    return { success: false, error: error.message };
  }
};

const importProductMailService = async ({ to, importStatus = 'SUCCESS', errorDetails = [], userName }) => {
  try {
    const templateData = {
      importStatus,
      errorDetails,
      ...importProductConstant,
      ...mailBranding,
      PRODUCT_IMPORT_HELLO: `Hello ${userName}`,
    };

    const subject = `${mailBranding.tenantName} - ${importProductConstant.SUBJECT}`;
    const html = productImportTemplate(templateData);

    const { success, messageId } = await sendEmailMessage({ to, subject, html });

    if (success) {
      console.log(`Product import email sent successfully. Message ID: ${messageId}`);
    } else {
      console.warn('Product import email failed to send.');
    }

    return { success, messageId };
  } catch (error) {
    console.error('sendImportProductEmail error:', error.message);
    return { success: false, error: error.message };
  }
};

const resetPasswordService = async ({ to, userName = 'User', resetUrl }) => {
  try {
    const templateData = {
      userName: userName || 'User',
      resetUrl,
      ...mailBranding,
      ...resetPasswordConstants,
    };

    const subject = `${mailBranding.tenantName} - ${resetPasswordConstants.RESET_PASSWORD_TITLE}`;
    const html = resetPasswordTemplate(templateData);

    const { success, messageId } = await sendEmailMessage({ to, subject, html });

    if (success) {
      console.log(`Reset password email sent successfully. Message ID: ${messageId}`);
    } else {
      console.warn('Reset password email failed to send.');
    }

    return { success, messageId };
  } catch (error) {
    console.error('sendResetPasswordEmail error:', error.message);
    return { success: false, error: error.message };
  }
};

export default { importProductMailService, resetPasswordService };
