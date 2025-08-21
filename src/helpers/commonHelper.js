// FUNC TO EXCAPE REGEX
export const escapeRegex = (string = '') => {
  const escaped = string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = `.*${escaped}.*`;

  return regexPattern;
};
