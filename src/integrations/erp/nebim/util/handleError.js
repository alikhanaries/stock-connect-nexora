import { connectNebim } from './connect.js';

export const handleNebimError = async (error, attempt, retries, endpoint) => {
  if (error.message.includes('Session') || error.message.includes('401')) {
    console.warn('⚠️ Nebim session expired — reconnecting...');
    await connectNebim();
    return true;
  }
  if (attempt < retries) {
    console.warn(`🔁 Retrying [${attempt + 1}/${retries}] for ${endpoint}`);
    return true;
  }
  console.error('❌ Nebim fetch failed permanently:', error.message);
  return false;
};
