/**
 * Helper functions for processing return data
 */

export const sanitizeReturnData = (returnData) => {
  try {
    if (!returnData) {
      throw new Error('Return data is required');
    }

    const sanitizedData = {
      returnId: returnData.Id?.toString(),
      merchantReturnNo: returnData.MerchantReturnNo,
      merchantOrderNo: returnData.MerchantOrderNo, // Store MerchantOrderNo for matching with orders
      channelOrderNo: returnData.ChannelOrderNo, // Also store ChannelOrderNo if needed
      channelId: returnData.ChannelId,
      totalPrice: returnData.RefundInclVat || 0,
      placedOn: returnData.ReturnDate ? new Date(returnData.ReturnDate) : null,
      acknowledgeDate: returnData.AcknowledgedDate ? new Date(returnData.AcknowledgedDate) : null,
      status: returnData.Status,
      platform: returnData.ChannelName,
      products: Array.isArray(returnData.Lines)
        ? returnData.Lines.map((line) => ({
            productSkuCode: line.MerchantProductNo,
            quantity: line.Quantity || 0,
          }))
        : [],
    };

    return { success: true, data: sanitizedData };
  } catch (error) {
    console.error('Error sanitizing return data:', error.message);
    return {
      success: false,
      message: `Error sanitizing return data: ${error.message}`,
      error: error.message,
    };
  }
};

export default {
  sanitizeReturnData,
};
