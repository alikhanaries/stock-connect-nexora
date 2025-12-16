let cachedSarRate = null;

export const getUsdToSarRate = async () => {
  if (cachedSarRate) return cachedSarRate;

  const url = 'https://api.exchangerate.host/latest?base=USD&symbols=SAR';

  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();

    cachedSarRate = data?.rates?.SAR ?? 3.75; // fallback
    return cachedSarRate;
  } catch (err) {
    console.error('Rate fetch failed, using fallback:', err.message);
    cachedSarRate = 3.75;
    return cachedSarRate;
  }
};

export const convertUsdToSar = async (usd = 0) => {
  const rate = await getUsdToSarRate();
  return Number((usd * rate).toFixed(2));
};
