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

const rateCache = {};

const getRateToSar = async (baseCurrency = 'USD') => {
  if (rateCache[baseCurrency]) return rateCache[baseCurrency];

  // SAR → SAR (no conversion)
  if (baseCurrency === 'SAR') {
    rateCache[baseCurrency] = 1;
    return 1;
  }

  try {
    const url = `https://api.exchangerate.host/latest?base=${baseCurrency}&symbols=SAR`;

    const res = await fetch(url);

    const data = await res.json();

    const rate = data?.rates?.SAR;

    if (!rate) throw new Error('Invalid rate');

    rateCache[baseCurrency] = rate;
    return rate;
  } catch (err) {
    console.log(err);
    console.error(`Rate fetch failed for ${baseCurrency}, using fallback`);

    // Fallbacks (safe defaults)
    const fallbackRates = {
      USD: 3.75,
      INR: 0.042,
      SAR: 1,
    };

    rateCache[baseCurrency] = fallbackRates[baseCurrency] ?? 1;
    return rateCache[baseCurrency];
  }
};

export const priceConverter = async (currencyCode = 'USD', value = 0) => {
  if (!value || value <= 0) return 0;

  const rate = await getRateToSar(currencyCode);

  return Number((Number(value) * rate).toFixed(2));
};
