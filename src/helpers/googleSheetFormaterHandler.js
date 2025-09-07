export const convertGoogleSheetUrlToExport = async (url) => {
  try {
    const isValidUrl = isValidGoogleSheetUrl(url);
    if (!isValidUrl) {
      return false;
    }
    const regex = /\/d\/([a-zA-Z0-9-_]+)/; // extract FILE_ID
    const match = url.match(regex);

    if (!match) return null;

    const fileId = match[1];
    // extract gid (sheet tab id)
    const gidMatch = url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : 0;

    return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${gid}`;
  } catch (err) {
    console.error('Google Sheet URL conversion failed:', err.message);
    throw new Error('Invalid Google Sheet URL');
  }
};

export const isValidGoogleSheetUrl = (url) => {
  try {
    const parsedUrl = new URL(url);

    // Must be Google Docs domain
    if (parsedUrl.hostname !== 'docs.google.com') return false;

    // Must be a spreadsheet
    if (!parsedUrl.pathname.includes('/spreadsheets/d/')) return false;

    // Must have a fileId
    const regex = /\/d\/([a-zA-Z0-9-_]+)/;
    return regex.test(parsedUrl.pathname);
  } catch {
    return false; // invalid URL format
  }
};
