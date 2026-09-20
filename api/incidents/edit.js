/**
 * Vercel Serverless Function: POST /api/incidents/edit
 * Allows editing incident description, coordinates, location/address, severity, and status.
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

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/incidents/edit. Use POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const id = body.id || body.disasterId;
    if (!id) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Incident ID (id) is required for editing.'
      });
    }

    const existing = await supabaseDb.getDisasterById(id);
    if (!existing) {
      return sendJson(res, 404, {
        success: false,
        error: 'Not Found',
        message: `Incident with ID ${id} not found.`
      });
    }

    const updates = {};
    if (body.description !== undefined) updates.description = body.description;
    if (body.title !== undefined) updates.title = body.title;
    if (body.latitude !== undefined) updates.latitude = parseFloat(body.latitude);
    if (body.longitude !== undefined) updates.longitude = parseFloat(body.longitude);
    if (body.location_name !== undefined || body.locationName !== undefined) {
      updates.location_name = body.location_name || body.locationName;
    }
    if (body.severity !== undefined) {
      const allowedSeverities = ['UNVERIFIED', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (!allowedSeverities.includes(body.severity)) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: `Invalid severity level: ${body.severity}. Allowed: ${allowedSeverities.join(', ')}`
        });
      }
      updates.severity = body.severity;
    }

    if (body.status !== undefined) {
      const allowedStatuses = ['PENDING', 'PENDING_VERIFICATION', 'VERIFIED_ACTIVE', 'IN_PROGRESS', 'CLOSED', 'CANCELLED_BY_ADMIN', 'CANCELLED', 'RESOLVED'];
      let targetStatus = body.status;
      if (targetStatus === 'CANCELLED') {
        targetStatus = 'CANCELLED_BY_ADMIN';
      }
      if (!allowedStatuses.includes(targetStatus)) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: `Invalid status '${targetStatus}'.`
        });
      }
      updates.status = targetStatus;
    }

    const updated = await supabaseDb.editDisaster(id, updates);

    return sendJson(res, 200, {
      success: true,
      message: 'Incident updated successfully.',
      data: updated
    });

  } catch (err) {
    console.error('API /api/incidents/edit error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to edit incident record.'
    });
  }
};
