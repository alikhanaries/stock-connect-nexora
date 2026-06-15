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
      TRY: 0.084,
      TRL: 0.084,
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

export const convertFromSar = async (targetCurrency = 'USD', sarValue = 0) => {
  if (!sarValue || sarValue <= 0) return 0;

  const rate = await getRateToSar(targetCurrency);

  return Number((sarValue / rate).toFixed(2));
};

const getRateToTRL = async () => {
  const cacheKey = 'SAR_TRY';
  if (rateCache[cacheKey]) return rateCache[cacheKey];

  try {
    const url = `https://api.exchangerate.host/latest?base=SAR&symbols=TRY`;
    const res = await fetch(url);
    const data = await res.json();
    const rate = data?.rates?.TRY;
    if (!rate) throw new Error('Invalid rate');
    rateCache[cacheKey] = rate;
    return rate;
  } catch (err) {
    console.log(err);
    console.error('SAR→TRY rate fetch failed, using fallback');
    // Fallback as of June 2026: 1 SAR ≈ 12.29 TRY
    rateCache[cacheKey] = 12.29;
    return 12.29;
  }
};

export const convertSarToTry = async (sarValue = 0) => {
  if (!sarValue || sarValue <= 0) return 0;
  const rate = await getRateToTRL();
  return Number((Number(sarValue) * rate).toFixed(2));
};
