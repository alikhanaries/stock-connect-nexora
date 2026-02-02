import { defaultMailOptions, transporter, mailBranding } from '../config/emailConfig.js';
import {
  importProductConstant,
  resetPasswordConstants,
  importInventoryConstant,
  importPriceConstant,
} from '../constants/emailConstants.js';
import { productImportTemplate } from '../emailTemplates/importProductTemplate.js';
import { resetPasswordTemplate } from '../emailTemplates/resetPasswordTemplate.js';
import { inventoryUpdateTemplate } from '../emailTemplates/updateInventoryTemplate.js';
import { priceUpdateTemplate } from '../emailTemplates/updatePriceTemplate.js';

const sendEmailNotification = async ({ to, subject, html }) => {
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
    const mailOptions = {
      to,
      subject: `${mailBranding.tenantName} - ${importProductConstant.SUBJECT}`,
      html: productImportTemplate({
        importStatus,
        errorDetails,
        ...importProductConstant,
        ...mailBranding,
        PRODUCT_IMPORT_HELLO: `Hello ${userName}`,
      }),
    };

    const { success, messageId } = await sendEmailNotification(mailOptions);

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

    const { success, messageId } = await sendEmailNotification(mailOptions);

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

const updateInventoryMailService = async ({ to, updateStatus = 'SUCCESS', errorDetails = [], userName }) => {
  try {
    const mailOptions = {
      to,
      subject: `${mailBranding.tenantName} - ${importInventoryConstant.SUBJECT}`,
      html: inventoryUpdateTemplate({
        updateStatus,
        errorDetails,
        ...importInventoryConstant,
        ...mailBranding,
        INVENTORY_UPDATE_HELLO: `Hello ${userName}`,
      }),
    };

    const { success, messageId } = await sendEmailNotification(mailOptions);

    if (success) {
      console.log(`Inventory import email sent successfully. Message ID: ${messageId}`);
    } else {
      console.warn('Inventory import email failed to send.');
    }

    return { success, messageId };
  } catch (error) {
    console.error('sendImportInventoryEmail error:', error.message);
    return { success: false, error: error.message };
  }
};

const updatePriceMailService = async ({ to, updateStatus = 'SUCCESS', errorDetails = [], userName }) => {
  try {
    const mailOptions = {
      to,
      subject: `${mailBranding.tenantName} - ${importPriceConstant.SUBJECT}`,
      html: priceUpdateTemplate({
        updateStatus,
        errorDetails,
        ...importPriceConstant,
        ...mailBranding,
        PRICE_UPDATE_HELLO: `Hello ${userName}`,
      }),
    };

    const { success, messageId } = await sendEmailNotification(mailOptions);

    if (success) {
      console.log(`Price import email sent successfully. Message ID: ${messageId}`);
    } else {
      console.warn('Price import email failed to send.');
    }

    return { success, messageId };
  } catch (error) {
    console.error('sendImportPriceEmail error:', error.message);
    return { success: false, error: error.message };
  }
};

export default { importProductMailService, resetPasswordService, updateInventoryMailService, updatePriceMailService };
