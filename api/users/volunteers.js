/**
 * Vercel Serverless Function: GET /api/users/volunteers
 * Returns users with role='VOLUNTEER' from Supabase database
 */

const { supabaseDb } = require('../../supabaseClient');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, apikey'
  });
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/users/volunteers. Use GET.`
    });
  }

  try {
    const volunteers = await supabaseDb.getVolunteersStrict();
    return sendJson(res, 200, {
      success: true,
      count: volunteers.length,
      data: volunteers
    });
  } catch (err) {
    console.error('API /api/users/volunteers error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to fetch volunteer directory.'
    });
  }
};
