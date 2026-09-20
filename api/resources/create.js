/**
 * Vercel Serverless Function: POST /api/resources/create (or /api/resources)
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

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/resources/create. Use POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const resourceType = body.resourceType || body.resource_type || 'OTHER';
    const description = (body.description || body.resourceName || body.resource_name || '').trim();
    const quantity = parseInt(body.quantity);
    const availableUntil = body.availableUntil || body.available_until || null;

    if (!description) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Resource description is required.'
      });
    }

    if (isNaN(quantity) || quantity <= 0) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid positive quantity is required.'
      });
    }

    const newResource = await supabaseDb.createResource({
      disasterId: body.disasterId || body.disaster_id || null,
      providerId: body.providerId || body.provider_id || null,
      resourceType: resourceType,
      description: description,
      resourceName: description,
      quantity: quantity,
      unit: body.unit || 'units',
      availableUntil: availableUntil,
      status: body.status || 'ACTIVE',
      contactPhone: body.contactPhone || body.contact_phone || null
    });

    return sendJson(res, 201, {
      success: true,
      message: 'Resource supply post created successfully.',
      data: newResource
    });

  } catch (err) {
    console.error('API /api/resources/create error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to create resource post.'
    });
  }
};
