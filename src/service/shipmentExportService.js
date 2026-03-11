import mongoose from 'mongoose';
import Shipment from '../models/Shipment/Shipment.js';
import { escapeCsv } from '../helpers/export.js';
import { AYMAKAN_STATUS } from '../util/ayMakanData.js';

export const exportShipmentToCSV = async (sellerId, filters, res) => {
  try {
    const { status, search, sortOrder = 'desc' } = filters;

    const query = {
      sellerId: new mongoose.Types.ObjectId(sellerId),
    };

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { airWaybillNo: { $regex: search, $options: 'i' } },
        { merchantShipmentNo: { $regex: search, $options: 'i' } },
        { merchantOrderNo: { $regex: search, $options: 'i' } },
        { 'shipmentMerchantDetails.name': { $regex: search, $options: 'i' } },
      ];
    }

    const sort = { createdAt: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    const pipeline = [
      { $match: query },
      { $unwind: '$products' },
      { $unwind: { path: '$trackingInfo', preserveNullAndEmptyArrays: true } },
      { $sort: sort },
    ];

    const cursor = Shipment.aggregate(pipeline).cursor();

    for await (const shipment of cursor) {
      const row = [
        shipment.products?.merchantProductNo || '',
        shipment.airWaybillNo || '',
        shipment.merchantOrderNo || '',
        shipment.merchantShipmentNo || '',
        shipment.products?.orderLineId || '',
        shipment.products?.quantity || 0,
        shipment.products?.hsCode || '',
        shipment.status || '',
        shipment.method || '',
        shipment.type || 'FORWARD',
        shipment.shipmentMerchantDetails?.name || '',
        shipment.shipmentMerchantDetails?.email || '',
        shipment.pieces || 0,
        shipment.isMerchantCreator ? 'Yes' : 'No',
        shipment.trackingInfo?.description || '',
        AYMAKAN_STATUS[shipment.trackingInfo?.statusCode]
          ? AYMAKAN_STATUS[shipment.trackingInfo?.statusCode]?.status
          : shipment.trackingInfo?.statusCode || '',
        shipment.trackingInfo?.date ? new Date(shipment.trackingInfo.date).toISOString() : '',
      ];

      if (!res.write(escapeCsv(row) + '\n')) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } catch (error) {
    console.error('Error in exportShipmentToCSV:', error);
    throw error;
  }
};
