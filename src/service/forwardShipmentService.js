const { OMNIFUL_API_URL, OMNIFUL_CLIENT_ID, OMNIFUL_CLIENT_SECRET } = config;
import { config } from '../config/config.js';
import Token from '../models/token.js';
export const getToken = async () => {
  return await Token.findOne({ name: 'omniful' });
};

export const upsertToken = async ({ accessToken, refreshToken }) => {
  await Token.findOneAndUpdate(
    { name: 'omniful' },
    { accessToken, refreshToken, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

let refreshPromise = null;

const isOlderThan25Days = (updatedAt) => {
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > 25 * 24 * 60 * 60 * 1000;
};

// Internal API call to refresh token
const fetchNewTokens = async (refreshToken) => {
  const response = await fetch(`${OMNIFUL_API_URL}/sales-channel/public/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: OMNIFUL_CLIENT_ID,
      client_secret: OMNIFUL_CLIENT_SECRET,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error('Token API failed');
  }

  return {
    accessToken: data?.data?.access_token,
    refreshToken: data?.data?.refresh_token,
  };
};

export const getReportToken = async () => {
  const tokenDoc = await getToken();

  if (!tokenDoc) {
    throw new Error('Token not initialized in DB');
  }

  if (!isOlderThan25Days(tokenDoc.updatedAt)) {
    return tokenDoc.accessToken;
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const newTokens = await fetchNewTokens(tokenDoc.refreshToken);

      await upsertToken(newTokens);

      return newTokens.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};
