import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { convertGoogleSheetUrlToExport } from '#root/src/helpers/googleSheetFormaterHandler.js';

export const fetchGoogleSheet = async (url) => {
  try {
    const exportUrl = await convertGoogleSheetUrlToExport(url);
    if (!exportUrl) throw new Error('Invalid Google Sheet URL');

    const response = await fetch(exportUrl);
    if (!response.ok) throw new Error(`Failed: ${response.statusText}`);

    const stream = Readable.fromWeb(response.body);
    const rows = [];

    let isFirstRow = true;

    return await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser({ headers: false }))
        .on('data', (row) => {
          if (isFirstRow) {
            isFirstRow = false;
            return;
          }
          rows.push(row);
        })
        .on('end', () => resolve(rows))
        .on('error', reject);
    });
  } catch (err) {
    console.error('Error fetching Google Sheet:', err.message);
    throw err;
  }
};
