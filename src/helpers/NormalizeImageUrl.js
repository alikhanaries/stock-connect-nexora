export function normalizeImageUrl(url) {
  if (!url) return url;
  const driveFileMatch = url.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveFileMatch) {
    const fileId = driveFileMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  const driveOpenMatch = url.match(/https:\/\/drive\.google\.com\/open\?id=([^&]+)/);
  if (driveOpenMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('dropbox.com')) {
      parsed.hostname = 'dl.dropboxusercontent.com';
      parsed.searchParams.set('raw', '1');
      return parsed.toString();
    }
  } catch {
    // ignore invalid URLs safely — continue below
  }

  if (url.includes('1drv.ms')) {
    return url.replace('1drv.ms', 'onedrive.live.com/download');
  }
  return url;
}
