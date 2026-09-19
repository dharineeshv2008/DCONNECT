/**
 * Vercel Serverless Function: GET /api/auth/profile
 */

const { supabaseDb } = require('../../supabaseClient');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, apikey'
  });
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed', message: 'Use GET for profile lookup.' });
  }

  try {
    const parts = (req.url || '').split('/');
    const id = parseInt(parts.pop() || req.query.id);

    if (isNaN(id)) {
      return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid user ID required.' });
    }

    const user = await supabaseDb.getUserById(id);
    if (!user) {
      return sendJson(res, 404, { success: false, error: 'Not Found', message: 'User not found' });
    }

    return sendJson(res, 200, { success: true, data: user });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: 'Internal Server Error', message: err.message });
  }
};
