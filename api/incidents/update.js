/**
 * Vercel Serverless Function: POST/PATCH /api/incidents/update
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
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/incidents/update. Use POST, PATCH, or PUT.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const incidentId = parseInt(body.incidentId || body.disasterId || body.id);
    let statusInput = (body.status || 'IN_PROGRESS').trim();

    if (!incidentId || isNaN(incidentId)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid incident ID is required.'
      });
    }

    // Map dropdown UI labels to canonical backend database statuses if needed
    let dbStatus = statusInput.toUpperCase();
    if (statusInput === 'Open') dbStatus = 'VERIFIED_ACTIVE';
    if (statusInput === 'In Progress') dbStatus = 'IN_PROGRESS';
    if (statusInput === 'Closed') dbStatus = 'CLOSED';
    if (statusInput === 'Cancelled by Admin') dbStatus = 'CANCELLED';

    const updated = await supabaseDb.updateDisaster(incidentId, {
      status: dbStatus,
      updated_at: new Date().toISOString()
    });

    return sendJson(res, 200, {
      success: true,
      message: `Incident #${incidentId} status updated to '${dbStatus}'.`,
      data: updated
    });

  } catch (err) {
    console.error('Update Incident API Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to update incident.'
    });
  }
};
