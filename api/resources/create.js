/**
 * Vercel Serverless Function: POST /api/resources/create (or /api/resources)
 */

const { supabaseDb } = require('../../supabaseClient');
const { sendAdminResourceNotification } = require('../../telegramBot');

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
    const latitude = body.latitude !== undefined ? parseFloat(body.latitude) : (body.lat !== undefined ? parseFloat(body.lat) : 13.0827);
    const longitude = body.longitude !== undefined ? parseFloat(body.longitude) : (body.lng !== undefined ? parseFloat(body.lng) : 80.2707);
    const address = (body.address || body.location || body.location_name || description || 'Central Relief Pool').trim();

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

    let rawStatus = (body.status || 'AVAILABLE').toString().toUpperCase().trim();
    let status = 'AVAILABLE';
    if (['AVAILABLE', 'ACTIVE', 'OPEN'].includes(rawStatus)) status = 'AVAILABLE';
    else if (['DISPATCHED', 'IN_PROGRESS', 'ALLOCATED'].includes(rawStatus)) status = 'DISPATCHED';
    else if (['EXHAUSTED', 'EXPIRED', 'INACTIVE', 'REMOVED'].includes(rawStatus)) status = 'EXHAUSTED';

    const newResource = await supabaseDb.createResource({
      disasterId: body.disasterId || body.disaster_id || null,
      providerId: body.providerId || body.provider_id || null,
      resourceType: resourceType,
      description: description,
      resourceName: description,
      quantity: quantity,
      unit: body.unit || 'units',
      latitude: isNaN(latitude) ? 13.0827 : latitude,
      longitude: isNaN(longitude) ? 80.2707 : longitude,
      address: address,
      availableUntil: availableUntil,
      status: status,
      contactPhone: body.contactPhone || body.contact_phone || null
    });

    if (newResource) {
      sendAdminResourceNotification({
        ...newResource,
        providerName: body.providerName || body.provider_name || 'Relief Agency'
      }).catch(err => console.warn('Telegram notification warning:', err.message));
    }

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
