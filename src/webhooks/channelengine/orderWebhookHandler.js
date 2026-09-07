import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';
import { processChannelEngineOrderWebhook } from './orderWebhookService.js';

/**
 * Controller handler for ChannelEngine Order Webhooks.
 * Immediately returns 200 OK to ChannelEngine and executes order sync in background.
 */
export const handleChannelEngineOrderWebhook = async (req, res) => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const tag = `[ce-order-webhook][run=${runId}]`;

  // 1. Immediately return 200 OK so ChannelEngine never times out
  Responses.successResponse(res, 'ChannelEngine webhook received successfully', 200);

  // 2. Delegate processing to webhook service in the background
  processChannelEngineOrderWebhook(req.body, req.query, tag).catch((err) => {
    console.error(`${tag} Webhook background processing failed:`, err.message);
    errorLog(err);
  });
};
