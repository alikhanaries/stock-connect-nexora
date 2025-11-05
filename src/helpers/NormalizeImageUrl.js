export function normalizeImageUrl(url) {
  if (!url) return url;
  const driveMatch = url.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)\//);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  const openMatch = url.match(/https:\/\/drive\.google\.com\/open\?id=([^&]+)/);
  if (openMatch) {
    return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  }
  if (url.includes('dropbox.com')) {
    let directUrl = url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('dropbox.com', 'dl.dropboxusercontent.com');
    directUrl = directUrl
      .replace('?dl=0', '')
      .replace('?dl=1', '')
      .replace('?raw=0', '?raw=1')
      .replace('?raw=1', '?raw=1');

    return directUrl;
  }
  if (url.includes('1drv.ms')) {
    return url.replace('1drv.ms', 'onedrive.live.com/download');
  }
  return url;
}
