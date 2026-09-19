/**
 * Vercel Serverless Function: POST /api/incidents/update
 * Enforces PostgreSQL check constraint compliance for Supabase disasters table
 */

const { supabaseDb } = require('../../supabaseClient');

// Allowed status values per Supabase 'disasters_status_check' constraint
const ALLOWED_DB_STATUSES = [
  'VERIFIED_ACTIVE',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'PENDING'
];

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

  // Method Validation: POST only
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/incidents/update. Use POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const incidentId = parseInt(body.incidentId || body.disasterId || body.id);
    let rawStatus = (body.status || '').trim();

    if (!incidentId || isNaN(incidentId)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid incident ID is required.'
      });
    }

    // Map UI labels & legacy inputs to valid PostgreSQL check constraint values
    let dbStatus = rawStatus.toUpperCase();
    if (rawStatus === 'Open') dbStatus = 'VERIFIED_ACTIVE';
    if (rawStatus === 'In Progress') dbStatus = 'IN_PROGRESS';
    if (rawStatus === 'Completed') dbStatus = 'RESOLVED';
    if (rawStatus === 'Closed') dbStatus = 'CLOSED';
    if (rawStatus === 'Cancelled by Admin' || rawStatus === 'CANCELLED_BY_ADMIN' || rawStatus === 'CANCELLED') {
      dbStatus = 'CLOSED';
    }

    // Strict validation against PostgreSQL disasters_status_check
    if (!ALLOWED_DB_STATUSES.includes(dbStatus)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: `Invalid status '${rawStatus}'. Allowed values: VERIFIED_ACTIVE, IN_PROGRESS, RESOLVED, CLOSED.`
      });
    }

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
      message: err.message || 'Failed to update incident in Supabase.'
    });
  }
};
