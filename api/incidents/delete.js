/**
 * Vercel Serverless Function: DELETE /api/incidents/delete
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

  // Method Validation: DELETE or POST allowed
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/incidents/delete. Use DELETE or POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || Object.keys(body).length === 0) {
      let raw = '';
      await new Promise((resolve) => {
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
          try { body = raw ? JSON.parse(raw) : {}; } catch (e) { body = {}; }
          resolve();
        });
        req.on('error', () => resolve());
      });
    }

    // Try extracting ID from query params, body, or URL path
    const urlParts = (req.url || '').split('?');
    const queryParams = new URLSearchParams(urlParts[1] || '');
    const pathParts = urlParts[0].split('/').filter(Boolean);
    const lastPart = parseInt(pathParts[pathParts.length - 1]);
    const incidentId = parseInt(body.incidentId || body.id || body.disasterId || queryParams.get('id') || queryParams.get('incidentId') || (isNaN(lastPart) ? null : lastPart));

    if (!incidentId || isNaN(incidentId)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid incident ID is required for deletion.'
      });
    }

    const deleted = await supabaseDb.deleteDisaster(incidentId);

    return sendJson(res, 200, {
      success: true,
      message: `Incident #${incidentId} deleted successfully.`,
      data: deleted
    });

  } catch (err) {
    console.error('Delete Incident API Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to delete incident from Supabase.'
    });
  }
};
