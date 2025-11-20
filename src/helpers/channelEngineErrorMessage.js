export const cancelChanelEngineCustomErrorMessage = (msg) => {
  // Extract order line ID (item id) from message
  let itemId = null;
  const match = msg.match(/order line ID\s*(\d+)/i);
  if (match) {
    itemId = match[1];
  }

  // Detect quantity mismatch = partial shipped scenario
  const qtyError = msg.includes('expected quantity') || msg.includes('received');

  if (qtyError) {
    msg = itemId
      ? `Some items (OrderLine ID: ${itemId}) have already been shipped, so the order cannot be canceled.`
      : `Some items have already been shipped in this order, so the order cannot be canceled.`;
  }
  return msg;
};
