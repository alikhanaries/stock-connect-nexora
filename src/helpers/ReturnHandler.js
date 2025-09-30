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
      orderId: returnData.OrderId?.toString(),
      channelId: returnData.ChannelId,
      totalPrice: returnData.TotalInclVat,
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

    // Validate required fields
    if (!sanitizedData.returnId) {
      throw new Error('Return ID is required');
    }

    if (!sanitizedData.merchantReturnNo) {
      throw new Error('Merchant Return Number is required');
    }

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

/**
 * Validates return data structure before processing
 */
export const validateReturnData = (returnData) => {
  try {
    if (!returnData) {
      return { success: false, message: 'Return data is required' };
    }

    if (!returnData.Id) {
      return { success: false, message: 'Return ID is required' };
    }

    if (!returnData.MerchantReturnNo) {
      return { success: false, message: 'Merchant Return Number is required' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error validating return data:', error.message);
    return {
      success: false,
      message: `Validation error: ${error.message}`,
      error: error.message,
    };
  }
};

export default {
  sanitizeReturnData,
  validateReturnData,
};
