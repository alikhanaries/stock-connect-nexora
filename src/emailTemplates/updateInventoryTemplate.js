export const inventoryUpdateTemplate = ({
  tenantName,
  tenantLogo,
  tenantColor,
  tenantEmail,
  updateStatus,
  errorDetails = [],
  INVENTORY_UPDATE_STATUS,
  INVENTORY_UPDATE_FAILED,
  INVENTORY_UPDATE_SUCCESS,
  INVENTORY_UPDATE_HELLO,
  INV_UPDATE_FAILED,
  INV_UPDATE_SUCCESS,
  INV_UPDATE_FOOTER,
  INV_UPDATE_PARTIAL_SUCCESS,
}) => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="utf-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>${tenantName} ${INVENTORY_UPDATE_STATUS}</title>
      <meta name="description" content="${tenantName} - Inventory Update Notification">
      <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="margin: 0; padding: 0;">
  <table style="margin: 0 auto; width: 100%;">
      <tr>
          <td>
              <table style="max-width: 560px; font-family: sans-serif; color: #1B1B1B;">
                  <!-- Header Logo -->
                  <tr>
                      <td style="background-color: ${tenantColor}; height: 60px; text-align: center;">
                         <img src="${tenantLogo}" alt="${tenantName} Logo" style="width: 70%; height: 50px; object-fit: contain; vertical-align: middle;">
                      </td>
                  </tr>
                  <!-- Main Content -->
                  <tr>
                      <td style="padding: 16px 24px;">
                          <!-- Status Banner -->
                          <table style="width: 100%; text-align: center;">
                              <tr>
                                  <td style="padding-bottom: 32px;">
                                      ${
                                        updateStatus === 'FAILED'
                                          ? `<h2 style="font-size: 30px; font-weight: 600; margin: 0; color: #D32F2F;">${INVENTORY_UPDATE_FAILED}</h2>`
                                          : `<h2 style="font-size: 30px; font-weight: 600; margin: 0; color: #388E3C;">${INVENTORY_UPDATE_SUCCESS}</h2>`
                                      }
                                  </td>
                              </tr>
                          </table>
                          <!-- Import Summary -->
                          <table style="width: 100%; border: 1px solid #DDD9D6; border-radius: 8px; margin-bottom: 16px;">
                              <tr>
                                  <td style="padding: 24px;">
                                      <p style="margin: 0; font-size: 16px;">${INVENTORY_UPDATE_HELLO}</p>
                                      ${
                                        updateStatus === 'FAILED'
                                          ? `<p style="margin: 8px 0; font-size: 16px;">${INV_UPDATE_FAILED}</p>`
                                          : `<p style="margin: 8px 0; font-size: 16px;">${INV_UPDATE_SUCCESS}</p>` +
                                            (errorDetails.length > 0
                                              ? `<p style="margin: 8px 0; font-size: 16px; color: #D32F2F;">${INV_UPDATE_PARTIAL_SUCCESS}</p>`
                                              : '')
                                      }
                                  </td>
                              </tr>
                          </table>
                          <!-- Error Details -->
                          ${
                            errorDetails.length > 0
                              ? `
                              <table style="width: 100%; border: 1px solid #DDD9D6; border-radius: 8px; margin-bottom: 16px; border-collapse: collapse;">
                                  <tr style="background-color: #F5F5F5;">
                                      <th style="border: 1px solid #DDD9D6; padding: 8px; text-align: left;">Row</th>
                                      <th style="border: 1px solid #DDD9D6; padding: 8px; text-align: left;">Errors</th>
                                  </tr>
                                  ${errorDetails
                                    .map(
                                      (err) => `
                                      <tr>
                                          <td style="border: 1px solid #DDD9D6; padding: 8px;">${err.rowNumber}</td>
                                          <td style="border: 1px solid #DDD9D6; padding: 8px;">
                                              <ul style="margin:0; padding-left: 20px;">
                                                  ${err.errorData.map((e) => `<li>${e}</li>`).join('')}
                                              </ul>
                                          </td>
                                      </tr>`
                                    )
                                    .join('')}
                              </table>
                              `
                              : ''
                          }
                          <!-- Contact Support -->
                          <table style="width: 100%; text-align: center;">
                              <tr>
                                  <td>
                                      <a href="mailto:${tenantEmail}"
                                         style="color: #E5A855; text-decoration: none; font-size: 16px; font-weight: 600;">
                                          ${tenantEmail}
                                      </a>
                                  </td>
                              </tr>
                          </table>
                          <!-- Footer -->
                          <table style="width: 100%; text-align: center; margin-top: 32px;">
                              <tr>
                                  <td style="font-size: 12px; color: #585858;">
                                      © 2025 ${tenantName}. ${INV_UPDATE_FOOTER}
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
