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
      TRY: 0.0835506,
      TRL: 0.0835506,
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
