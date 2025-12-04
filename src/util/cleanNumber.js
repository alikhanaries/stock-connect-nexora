export const cleanNumber = (v) => {
  if (!v) return null;
  return parseFloat(String(v).replace(/,/g, ''));
};
