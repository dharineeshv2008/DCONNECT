/**
 * Vercel Serverless Function: POST /api/telegram/webhook
 * Handles incoming Telegram Bot webhook updates (commands and inline button callback queries)
 */

const { handleTelegramWebhook } = require('../../telegramBot');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  return handleTelegramWebhook(req, res);
};
