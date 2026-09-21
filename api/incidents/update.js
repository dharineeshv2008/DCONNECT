/**
 * Vercel Serverless Function: POST /api/incidents/update
 * Enforces PostgreSQL check constraint compliance for Supabase disasters table
 */

const { supabaseDb } = require('../../supabaseClient');

const ALLOWED_DB_STATUSES = [
  'PENDING_VERIFICATION',
  'VERIFIED_ACTIVE',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED_BY_ADMIN',
  'PENDING'
];

function isValidStatusTransition(currentStatus, targetStatus) {
  const c = (currentStatus || 'PENDING_VERIFICATION').toUpperCase();
  const t = (targetStatus || '').toUpperCase();
  if (c === t) return true;

  const allowedTransitions = {
    'PENDING': ['VERIFIED_ACTIVE', 'CANCELLED_BY_ADMIN', 'CLOSED'],
    'PENDING_VERIFICATION': ['VERIFIED_ACTIVE', 'CANCELLED_BY_ADMIN', 'CLOSED'],
    'VERIFIED_ACTIVE': ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED_BY_ADMIN'],
    'IN_PROGRESS': ['RESOLVED', 'CLOSED', 'CANCELLED_BY_ADMIN'],
    'RESOLVED': ['CLOSED', 'CANCELLED_BY_ADMIN'],
    'CLOSED': ['CANCELLED_BY_ADMIN'],
    'CANCELLED_BY_ADMIN': ['CLOSED']
  };

  return allowedTransitions[c] ? allowedTransitions[c].includes(t) : true;
}

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

    const incidentId = parseInt(body.id || body.incidentId || body.disasterId);
    let rawStatus = (body.status || '').trim();

    if (!incidentId || isNaN(incidentId)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid incident ID is required.'
      });
    }

    if (!rawStatus) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Status is required.'
      });
    }

    // SAFEGUARD: Validate id exists before update
    const existing = await supabaseDb.getDisasterById(incidentId);
    if (!existing) {
      return sendJson(res, 404, {
        success: false,
        error: 'Not Found',
        message: `Incident #${incidentId} does not exist.`
      });
    }

    // Map UI labels & legacy inputs to valid PostgreSQL check constraint values
    let dbStatus = rawStatus.toUpperCase();
    if (rawStatus === 'Open') dbStatus = 'VERIFIED_ACTIVE';
    if (rawStatus === 'In Progress') dbStatus = 'IN_PROGRESS';
    if (rawStatus === 'Completed') dbStatus = 'RESOLVED';
    if (rawStatus === 'Closed') dbStatus = 'CLOSED';
    if (rawStatus === 'Cancelled by Admin' || rawStatus === 'CANCELLED_BY_ADMIN' || rawStatus === 'CANCELLED') {
      dbStatus = 'CANCELLED_BY_ADMIN';
    }

    // Strict validation against PostgreSQL disasters_status_check
    if (!ALLOWED_DB_STATUSES.includes(dbStatus)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: `Invalid status '${rawStatus}'. Allowed values: PENDING_VERIFICATION, VERIFIED_ACTIVE, IN_PROGRESS, RESOLVED, CLOSED, CANCELLED_BY_ADMIN.`
      });
    }

    // MANDATORY BACKEND VALIDATION: Enforce valid status transition
    if (!isValidStatusTransition(existing.status, dbStatus)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Invalid State Transition',
        message: `Cannot transition incident #${incidentId} status from '${existing.status}' to '${dbStatus}'.`
      });
    }

    // Requirement 1 & 4: Call centralized status update function
    const updated = await supabaseDb.updateDisasterStatus(
      incidentId,
      rawStatus,
      body.verifiedById || body.verified_by_user_id || body.adminId
    );

    return sendJson(res, 200, {
      success: true,
      message: `Incident #${incidentId} status updated to '${updated.status}'.`,
      updatedStatus: updated.status,
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
