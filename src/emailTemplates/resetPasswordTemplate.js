export const resetPasswordTemplate = ({
  tenantName,
  tenantLogo,
  tenantColor,
  tenantEmail,
  userName = 'User',
  resetUrl,
  RESET_PASSWORD_TITLE,
  RESET_PASSWORD_SUBTITLE,
  RESET_PASSWORD_HELLO,
  RESET_PASSWORD_CLICK,
  RESET_PASSWORD_IGNORE,
  RESET_PASSWORD_CONTACT,
  RESET_PASSWORD_FOOTER,
}) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <title>${tenantName} - ${RESET_PASSWORD_TITLE}</title>
      <meta name="description" content="${tenantName} - ${RESET_PASSWORD_TITLE}" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin: 0; padding: 0;">
      <table style="width: 100%;">
        <tr>
          <td>
            <table style="max-width: 560px; font-family: sans-serif; color: #1b1b1b;">
              <!-- Header Logo -->
              <tr>
                <td style="background-color: ${tenantColor}; height: 60px; text-align: center;">
                  <img src="${tenantLogo}" alt="${tenantName} Logo" style="width: 70%; height: 50px; object-fit: contain; vertical-align: middle;">
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 24px;">
                  <table style="width: 100%;">
                    <tr>
                      <td style="text-align: center; padding: 24px 0;">
                        <h2 style="font-size: 30px; font-weight: 600; margin: 0;">${RESET_PASSWORD_TITLE}</h2>
                      </td>
                    </tr>
                  </table>

                  <!-- Reset Password Card -->
                  <table style="width: 100%; border: 1px solid #ddd9d6; border-radius: 8px; padding: 24px;">
                    <tr>
                      <td style="padding-bottom: 24px; line-height: 24px; text-align: center;">
                        <p style="margin: 0; font-size: 16px;">
                          ${RESET_PASSWORD_HELLO} ${userName}, ${RESET_PASSWORD_SUBTITLE}
                        </p>
                        <p style="margin: 8px 0; font-size: 16px;">
                          ${RESET_PASSWORD_CLICK}
                        </p>
                        <a href="${resetUrl}" style="background-color: ${tenantColor}; color: #1b1b1b; border: none; padding: 12px 30px; border-radius: 4px; font-weight: 500; font-size: 16px; display: inline-block; margin-top: 16px;">
                          ${RESET_PASSWORD_TITLE}
                        </a>
                        <p style="margin-top: 24px; font-size: 14px; line-height: 20px;">
                          ${RESET_PASSWORD_IGNORE}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Contact -->
                  <table style="width: 100%; text-align: center; margin-top: 24px;">
                    <tr>
                      <td>
                        <p style="color: #585858; font-size: 14px; margin: 0;">${RESET_PASSWORD_CONTACT}</p>
                        <a href="mailto:${tenantEmail}" style="color: ${tenantColor}; text-decoration: none; font-size: 16px; font-weight: 600;">
                          ${tenantEmail}
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Footer -->
                  <table style="width: 100%; text-align: center; margin-top: 32px;">
                    <tr>
                      <td style="font-size: 12px; color: #585858;">
                        ${RESET_PASSWORD_FOOTER.replace('{tenantName}', tenantName)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};
