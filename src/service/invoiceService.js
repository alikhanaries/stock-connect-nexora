import { uploadImage } from './s3Service.js';
import { config } from '#config/config.js';
import { Buffer } from 'buffer';
import { getCommerceProvider } from '#service/commerce/commerceProviderFactory.js';

// helper function
export const fetchImageAsFile = async (merchantNo) => {
  const response = await getCommerceProvider().fetchOrderInvoice(merchantNo);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.split('/')[1] || 'jpg';

  return {
    originalname: `remote-image.${ext}`,
    mimetype: contentType,
    buffer,
  };
};

export const uploadInvoiceService = async (merchantNo) => {
  try {
    const file = await fetchImageAsFile(merchantNo);
    if (!file) return { success: false };

    const fileName = `OrderInvoice--${merchantNo}`;
    const imageUrl = await uploadImage(file, fileName, config.BUCKET_NAME);
    if (!imageUrl) return { success: false };

    return {
      success: true,
      data: imageUrl,
    };
  } catch (error) {
    console.error('Error in uploadInvoiceService:', error);
    return { success: false, message: error.message };
  }
};
