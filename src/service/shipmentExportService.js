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
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeSearch = escapeRegex(search);

      query.$or = [
        { airWaybillNo: { $regex: safeSearch, $options: 'i' } },
        { merchantShipmentNo: { $regex: safeSearch, $options: 'i' } },
        { merchantOrderNo: { $regex: safeSearch, $options: 'i' } },
        { 'shipmentMerchantDetails.name': { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const sort = { createdAt: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    const pipeline = [
      { $match: query },
      { $sort: sort },
      {
        $lookup: {
          from: 'channelengineorders',
          localField: 'orderId',
          foreignField: '_id',
          as: 'orderData',
          pipeline: [
            {
              $project: {
                orderId: 1,
                channelName: 1,
                channelOrderNumber: 1,
                orderDate: 1,
                status: 1,
                'orderSkuList.skuList.id': 1,
                'orderSkuList.skuList.lineTotalExclVat': 1,
                'orderSkuList.skuList.lineVat': 1,
                'orderSkuList.skuList.lineTotalInclVat': 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          order: { $arrayElemAt: ['$orderData', 0] },
          totalProducts: { $size: '$products' },
          totalQuantity: { $sum: '$products.quantity' },
          productSKUs: {
            $reduce: {
              input: '$products',
              initialValue: '',
              in: {
                $cond: [
                  { $eq: ['$$value', ''] },
                  '$$this.merchantProductNo',
                  { $concat: ['$$value', ' | ', '$$this.merchantProductNo'] },
                ],
              },
            },
          },
          allHsCodes: {
            $reduce: {
              input: {
                $filter: {
                  input: '$products',
                  as: 'p',
                  cond: { $and: [{ $ne: ['$$p.hsCode', null] }, { $ne: ['$$p.hsCode', ''] }] },
                },
              },
              initialValue: '',
              in: {
                $cond: [{ $eq: ['$$value', ''] }, '$$this.hsCode', { $concat: ['$$value', ' | ', '$$this.hsCode'] }],
              },
            },
          },
          trackingCount: { $size: '$trackingInfo' },
          latestTracking: { $arrayElemAt: ['$trackingInfo', -1] },
          trackingHistory: {
            $reduce: {
              input: '$trackingInfo',
              initialValue: '',
              in: {
                $cond: [
                  { $eq: ['$$value', ''] },
                  '$$this.statusCode',
                  { $concat: ['$$value', ' | ', '$$this.statusCode'] },
                ],
              },
            },
          },
        },
      },
      {
        // Single pass over products×skuList instead of three separate passes
        $addFields: {
          _totals: {
            $reduce: {
              input: '$products',
              initialValue: { subtotal: 0, tax: 0, total: 0 },
              in: {
                $let: {
                  vars: {
                    matched: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: { $ifNull: ['$order.orderSkuList.skuList', []] },
                            as: 'sku',
                            cond: { $eq: ['$$sku.id', '$$this.orderLineId'] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    subtotal: { $add: ['$$value.subtotal', { $ifNull: ['$$matched.lineTotalExclVat', 0] }] },
                    tax: { $add: ['$$value.tax', { $ifNull: ['$$matched.lineVat', 0] }] },
                    total: { $add: ['$$value.total', { $ifNull: ['$$matched.lineTotalInclVat', 0] }] },
                  },
                },
              },
            },
          },
        },
      },
      {
        $project: {
          status: 1,
          shipmentMethod: 1,
          merchantShipmentNo: 1,
          airWaybillNo: 1,
          pieces: 1,
          createdAt: 1,
          updatedAt: 1,
          merchantOrderNo: 1,
          totalProducts: 1,
          productSKUs: 1,
          totalQuantity: 1,
          allHsCodes: 1,
          trackingCount: 1,
          latestTracking: 1,
          trackingHistory: 1,
          'order.orderId': 1,
          'order.channelName': 1,
          'order.channelOrderNumber': 1,
          'order.orderDate': 1,
          'order.status': 1,
          shipmentSubtotal: '$_totals.subtotal',
          shipmentTax: '$_totals.tax',
          shipmentTotal: '$_totals.total',
        },
      },
    ];

    const cursor = Shipment.aggregate(pipeline).cursor();

    for await (const shipment of cursor) {
      const latestStatusCode = shipment.latestTracking?.statusCode || '';
      const aymakanEntry = AYMAKAN_STATUS[latestStatusCode];
      const row = [
        shipment.productSKUs || '',
        shipment.merchantShipmentNo || '',
        shipment.airWaybillNo || '',
        shipment.order?.orderId || '',
        shipment.merchantOrderNo || '',
        shipment.order?.channelOrderNumber || '',
        shipment.order?.channelName || '',
        shipment.status || '',
        shipment.shipmentMethod || '',
        shipment.pieces || 0,
        shipment.order?.status || '',
        shipment.createdAt ? new Date(shipment.createdAt).toISOString() : '',
        shipment.updatedAt ? new Date(shipment.updatedAt).toISOString() : '',
        shipment.order?.orderDate ? new Date(shipment.order.orderDate).toISOString() : '',
        shipment.totalProducts || 0,
        shipment.totalQuantity || 0,
        shipment.allHsCodes || '',
        shipment.shipmentSubtotal || 0,
        shipment.shipmentTax || 0,
        shipment.shipmentTotal || 0,
        shipment.trackingCount || 0,
        aymakanEntry ? aymakanEntry.status : latestStatusCode,
        shipment.latestTracking?.description || '',
        shipment.latestTracking?.createdAt ? new Date(shipment.latestTracking.createdAt).toISOString() : '',
        (shipment.trackingHistory || '')
          .split(' | ')
          .map((code) => AYMAKAN_STATUS[code]?.status || code)
          .join(' | '),
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
