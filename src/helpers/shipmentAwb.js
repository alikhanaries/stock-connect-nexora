/**
 * Resolve customer-facing vs first-mile shipment AWBs.
 *
 * DB fields (never modified by these helpers):
 * - airWaybillNo: first-mile Aymakan AWB
 * - omniful.trackingNo: final courier AWB from OmniFul/Widect ready_to_ship
 */

export const resolveFirstMileAirWaybillNo = (shipment) => {
  const awb = shipment?.airWaybillNo;
  if (awb == null) return '';
  return String(awb).trim();
};

export const resolveFinalCourierAirWaybillNo = (shipment) => {
  const awb = shipment?.omniful?.trackingNo;
  if (awb == null) return '';
  return String(awb).trim();
};

/**
 * Customer-facing / downstream effective AWB.
 * Prefers OmniFul final courier AWB when present on Aymakan warehouse shipments.
 */
export const resolveEffectiveShipmentAwb = (shipment) => {
  if (!shipment) return null;

  const firstMile = resolveFirstMileAirWaybillNo(shipment);
  const method = String(shipment.shipmentMethod || '').toUpperCase();

  if (method === 'MANUAL' || method === 'UNICOMMERCE') {
    return firstMile || null;
  }

  const finalCourier = resolveFinalCourierAirWaybillNo(shipment);

  if (finalCourier && method === 'AYMAKAN') {
    return finalCourier;
  }

  return firstMile || null;
};
