import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
export const getAccessToken = async () => {
  const url = `${entegraConfig?.ENTEGRA_BASE_URL}api/user/token/obtain/`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: entegraConfig?.ENTEGRA_EMAIL,
        password: entegraConfig?.ENTEGRA_PASSWORD,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token fetch failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Common token response patterns
    const accessToken = data.access || data.access_token || data.token;

    if (!accessToken) {
      throw new Error('Access token not found in response');
    }

    return `JWT ${accessToken}`;
  } catch (error) {
    console.error('getAccessToken error:', error);
    throw error;
  }
};
