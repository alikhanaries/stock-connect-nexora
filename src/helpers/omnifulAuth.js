import { config } from '../config/config.js';
import Token from '../models/Token.js';

const { OMNIFUL_API_URL, OMNIFUL_CLIENT_ID, OMNIFUL_CLIENT_SECRET } = config;

const TOKEN_DOC_NAME = 'omniful';
const TOKEN_MAX_AGE_MS = 25 * 24 * 60 * 60 * 1000;

/** @returns {Promise<import('mongoose').Document|null>} */
export const getOmnifulTokenDoc = async () => Token.findOne({ name: TOKEN_DOC_NAME });

/** @param {{ accessToken: string, refreshToken: string }} tokens */
export const upsertOmnifulToken = async ({ accessToken, refreshToken }) => {
  await Token.findOneAndUpdate(
    { name: TOKEN_DOC_NAME },
    { accessToken, refreshToken, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

const isOlderThan25Days = (updatedAt) => Date.now() - new Date(updatedAt).getTime() > TOKEN_MAX_AGE_MS;

/**
 * Exchange a refresh token for new access/refresh tokens.
 * @param {string} refreshToken
 */
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

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OmniFul token API failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    accessToken: data?.data?.access_token,
    refreshToken: data?.data?.refresh_token,
  };
};

const resolveRefreshToken = (tokenDoc) => tokenDoc?.refreshToken || process.env.OMNIFUL_REFRESH_TOKEN || null;

/**
 * Returns a valid OmniFul access token, refreshing from DB or env when needed.
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<string>}
 */
export const getOmnifulAccessToken = async ({ forceRefresh = false } = {}) => {
  const tokenDoc = await getOmnifulTokenDoc();

  if (!forceRefresh && tokenDoc && !isOlderThan25Days(tokenDoc.updatedAt)) {
    return tokenDoc.accessToken;
  }

  const refreshTokenToUse = resolveRefreshToken(tokenDoc);
  if (!refreshTokenToUse) {
    throw new Error('OmniFul token not initialized in DB and OMNIFUL_REFRESH_TOKEN is missing');
  }

  const newTokens = await fetchNewTokens(refreshTokenToUse);
  if (!newTokens.accessToken) {
    throw new Error('OmniFul token API returned no access_token');
  }

  await upsertOmnifulToken(newTokens);
  return newTokens.accessToken;
};

/** @deprecated Use getOmnifulAccessToken — kept for existing imports */
export const getReportToken = getOmnifulAccessToken;

/** @deprecated Use upsertOmnifulToken */
export const upsertToken = upsertOmnifulToken;

/** @deprecated Use getOmnifulTokenDoc */
export const getToken = getOmnifulTokenDoc;

/**
 * Infer staging vs production from OMNIFUL_API_URL.
 * @returns {'staging'|'production'|'unknown'}
 */
export const getOmnifulEnvironment = () => {
  const url = (OMNIFUL_API_URL || '').toLowerCase();
  if (url.includes('staging')) return 'staging';
  if (url.includes('prodapi')) return 'production';
  return 'unknown';
};

export const getOmnifulBaseUrl = () => OMNIFUL_API_URL;
