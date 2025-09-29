/**
 * Helper functions for processing return data
 * Helper function to build a full name from customer data
 */
export const formatName = (customer) => {
  try {
    if (!customer) return '';
    const firstName = customer.FirstName || '';
    const lastName = customer.LastName || '';
    return `${firstName} ${lastName}`.trim();
  } catch (error) {
    console.error('Error formatting name:', error.message);
    return '';
  }
};

/**
 * Helper function to build a single address string from address object
 */
export const formatAddress = (address) => {
  try {
    if (!address) return '';
    const parts = [
      address.Line1,
      address.Line2,
      address.Line3,
      address.City,
      address.Region,
      address.ZipCode,
      address.CountryName,
    ];
    return parts.filter(Boolean).join(', '); // Join parts that exist
  } catch (error) {
    console.error('Error formatting address:', error.message);
    return '';
  }
};

export const sanitizeReturnData = (returnData) => {
  try {
    if (!returnData) {
      throw new Error('Return data is required');
    }

    const sanitizedData = {
      returnId: returnData.Id?.toString(),
      merchantReturnNo: returnData.MerchantReturnNo,
      orderId: returnData.OrderId?.toString(),
      name: formatName(returnData.Customer),
      address: formatAddress(returnData.Address),
      channelId: returnData.ChannelId,
      phone: returnData.Customer?.Phone,
      email: returnData.Email,
      totalPrice: returnData.TotalInclVat,
      placedOn: returnData.ReturnDate ? new Date(returnData.ReturnDate) : null,
      acknowledgeDate: returnData.AcknowledgedDate ? new Date(returnData.AcknowledgedDate) : null,
      status: returnData.Status,
      platform: returnData.ChannelName,
      products: Array.isArray(returnData.Lines)
        ? returnData.Lines.map((line) => ({
            merchantProductNo: line.MerchantProductNo,
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

/**
 * Builds database query filters and pagination options for return searches.
 */
const buildReturnQuery = (filters = {}) => {
  try {
    const { status, channelId, returnId, dateFrom, dateTo, page, limit } = filters;
    const query = {};

    // Pagination logic
    const currentPage = Math.max(1, parseInt(page, 10) || 1); //
    const size = Math.max(1, parseInt(limit, 10) || 10); //
    const skip = (currentPage - 1) * size;
    const paginationOptions = { skip, limit: size };

    // Filtering logic
    if (status) {
      query.status = status;
    }

    if (channelId) {
      const parsedChannelId = parseInt(channelId, 10);
      if (isNaN(parsedChannelId)) {
        throw new Error('Invalid channel ID format');
      }
      query.channelId = parsedChannelId;
    }

    if (returnId) {
      query.returnId = returnId;
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        if (isNaN(fromDate.getTime())) {
          throw new Error('Invalid dateFrom format');
        }
        query.createdAt.$gte = fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        if (isNaN(toDate.getTime())) {
          throw new Error('Invalid dateTo format');
        }
        query.createdAt.$lte = toDate;
      }
    }

    return { success: true, query, paginationOptions };
  } catch (error) {
    console.error('Error building return query:', error.message);
    return {
      success: false,
      message: `Error building query: ${error.message}`,
      error: error.message,
    };
  }
};

export default {
  formatName,
  formatAddress,
  sanitizeReturnData,
  validateReturnData,
  buildReturnQuery,
};
