import xml2js from 'xml2js';

export const parseXMLFeed = async (xmlString) => {
  try {
    if (!xmlString || !xmlString.trim()) {
      throw new Error('Empty XML string');
    }
    const parser = new xml2js.Parser({ explicitArray: false, trim: true });
    const parsed = await parser.parseStringPromise(xmlString);
    return parsed;
  } catch (err) {
    console.error('XML parsing failed:', err.message);
    throw err;
  }
};
