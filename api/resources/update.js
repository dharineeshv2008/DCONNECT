/**
 * Vercel Serverless Function: POST /api/resources/update
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

  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/resources/update. Use POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const id = parseInt(body.id || body.resourceId);
    if (!id || isNaN(id)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid resource ID (id) is required.'
      });
    }

    const updates = {};
    if (body.resourceType || body.resource_type) updates.resourceType = body.resourceType || body.resource_type;
    if (body.description !== undefined) updates.description = body.description;
    if (body.quantity !== undefined) updates.quantity = parseInt(body.quantity);
    if (body.availableUntil !== undefined || body.available_until !== undefined) {
      updates.availableUntil = body.availableUntil || body.available_until;
    }
    if (body.status !== undefined) {
      const allowedStatuses = ['ACTIVE', 'EXPIRED', 'REMOVED', 'AVAILABLE'];
      let st = body.status;
      if (st === 'AVAILABLE') st = 'ACTIVE';
      if (!allowedStatuses.includes(st)) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: `Invalid status: ${body.status}. Allowed: ACTIVE, EXPIRED, REMOVED`
        });
      }
      updates.status = st;
    }

    const updated = await supabaseDb.updateResource(id, updates);

    return sendJson(res, 200, {
      success: true,
      message: `Resource #${id} updated successfully.`,
      data: updated
    });

  } catch (err) {
    console.error('API /api/resources/update error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to update resource.'
    });
  }
};
