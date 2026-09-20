/**
 * Vercel Serverless Function: GET /api/resources & POST /api/resources
 */

const { supabaseDb } = require('../supabaseClient');

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

  try {
    if (req.method === 'GET') {
      const list = await supabaseDb.getResources();
      return sendJson(res, 200, {
        success: true,
        count: list.length,
        data: list
      });
    }

    if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }

      const resourceName = (body.resourceName || body.resource_name || '').trim();
      if (!resourceName) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: 'Resource name is required.'
        });
      }

      const newRes = await supabaseDb.createResource({
        disasterId: body.disasterId || body.disaster_id || null,
        providerId: body.providerId || body.provider_id || null,
        resourceType: body.resourceType || body.resource_type || 'OTHER',
        resourceName: resourceName,
        quantity: parseInt(body.quantity) || 1,
        unit: body.unit || 'units',
        contactPhone: body.contactPhone || body.contact_phone || null
      });

      return sendJson(res, 201, {
        success: true,
        message: 'Resource added to emergency pool successfully.',
        data: newRes
      });
    }

    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/resources. Use GET or POST.`
    });

  } catch (err) {
    console.error('API /api/resources Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to process resource request.'
    });
  }
};
