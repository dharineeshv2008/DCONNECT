/**
 * Vercel Serverless Function: GET /api/incidents/list (or /api/incidents)
 */

const url = require('url');
const { supabaseDb } = require('../../supabaseClient');

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const rLat1 = lat1 * Math.PI / 180;
  const rLat2 = lat2 * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rLat1) * Math.cos(rLat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

  if (req.method !== 'GET') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/incidents/list. Use GET.`
    });
  }

  try {
    const parsedUrl = url.parse(req.url, true);
    const userLat = parseFloat(parsedUrl.query.lat);
    const userLon = parseFloat(parsedUrl.query.lon);
    const status = parsedUrl.query.status;

    const list = await supabaseDb.getAllDisasters(status);
    const result = list.map(d => {
      let dist = null;
      if (!isNaN(userLat) && !isNaN(userLon) && d.latitude && d.longitude) {
        dist = calculateDistanceKm(userLat, userLon, d.latitude, d.longitude);
      }
      return {
        id: d.id,
        type: d.type,
        title: d.title,
        description: d.description,
        severity: d.severity,
        latitude: d.latitude,
        longitude: d.longitude,
        locationName: d.location_name,
        status: d.status,
        reportCount: d.report_count || 1,
        createdById: d.created_by_user_id,
        createdByName: d.createdByName || 'Authorized Responder',
        createdByRole: d.createdByRole || 'PUBLIC',
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        distanceFromUserKm: dist
      };
    });

    return sendJson(res, 200, {
      success: true,
      data: result
    });

  } catch (err) {
    console.error('List Incidents API Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to fetch incidents.'
    });
  }
};
