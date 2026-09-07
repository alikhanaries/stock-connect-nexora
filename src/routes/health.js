import express from 'express';
import mongoose from 'mongoose';
import { isServerReady, isShuttingDown } from '#config/serverState.js';

const router = express.Router();

/**
 * @openapi
 * /health/live:
 *   get:
 *     tags:
 *       - Health
 *     summary: Liveness probe
 *     description: Returns 200 when the Node process is running. Used by orchestrators to detect a crashed process.
 *     responses:
 *       200:
 *         description: Process is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: alive
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    statusCode: 200,
  });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     tags:
 *       - Health
 *     summary: Readiness probe
 *     description: Returns 200 when MongoDB and the Channel Engine queue worker are ready to serve traffic. Returns 503 during startup or shutdown.
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: ready
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *       503:
 *         description: Service is not ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 status:
 *                   type: string
 *                   example: not_ready
 *                 statusCode:
 *                   type: integer
 *                   example: 503
 */
router.get('/ready', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;

  if (isShuttingDown() || !isServerReady() || !dbConnected) {
    return res.status(503).json({
      success: false,
      status: 'not_ready',
      statusCode: 503,
    });
  }

  res.status(200).json({
    success: true,
    status: 'ready',
    statusCode: 200,
  });
});

export default router;
