/**
 * Vercel Serverless Function: POST /api/incidents/create (or /api/incidents/report)
 */

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

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/incidents/create. Use POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const type = body.type || 'FLOOD';
    const userLat = parseFloat(body.latitude);
    const userLon = parseFloat(body.longitude);

    if (isNaN(userLat) || isNaN(userLon)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid latitude and longitude are required.'
      });
    }

    // Deduplication check using 10km Haversine distance
    const candidates = await supabaseDb.getCandidateDisastersForMerge(type);
    let targetDisaster = null;
    let closestDist = Infinity;

    for (const c of candidates) {
      const dist = calculateDistanceKm(userLat, userLon, c.latitude, c.longitude);
      if (dist <= 10.0 && dist < closestDist) {
        closestDist = dist;
        targetDisaster = c;
      }
    }

    if (targetDisaster) {
      const updatedCount = (targetDisaster.report_count || 1) + 1;
      await supabaseDb.updateDisaster(targetDisaster.id, {
        report_count: updatedCount,
        updated_at: new Date().toISOString()
      });

      await supabaseDb.createReport({
        disaster_id: targetDisaster.id,
        reporter_id: body.reporterId || null,
        reporter_name: body.reporterName || 'Anonymous Citizen',
        reporter_phone: body.reporterPhone || 'N/A',
        latitude: userLat,
        longitude: userLon,
        message: body.description || 'Incident report'
      });

      return sendJson(res, 201, {
        success: true,
        message: `Report merged into existing ${type} incident (#${targetDisaster.id}).`,
        data: { ...targetDisaster, reportCount: updatedCount, wasMerged: true }
      });
    } else {
      let initialStatus = 'PENDING';
      if (body.reporterId) {
        const reporter = await supabaseDb.getUserById(body.reporterId);
        if (reporter && ['ADMIN', 'GOVERNMENT_AGENCY', 'NGO'].includes(reporter.role)) {
          initialStatus = 'VERIFIED_ACTIVE';
        }
      }

      const newDisaster = await supabaseDb.createDisaster({
        type: type,
        title: body.title || `${type} Emergency`,
        description: body.description || 'Emergency reported.',
        severity: body.severity || 'MEDIUM',
        latitude: userLat,
        longitude: userLon,
        location_name: body.locationName || `Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`,
        status: initialStatus,
        report_count: 1,
        created_by_user_id: body.reporterId || null
      });

      await supabaseDb.createReport({
        disaster_id: newDisaster.id,
        reporter_id: body.reporterId || null,
        reporter_name: body.reporterName || 'Anonymous Citizen',
        reporter_phone: body.reporterPhone || 'N/A',
        latitude: userLat,
        longitude: userLon,
        message: body.description || 'Emergency reported.'
      });

      return sendJson(res, 201, {
        success: true,
        message: initialStatus === 'VERIFIED_ACTIVE' ? 'Incident published to live feed.' : 'Citizen report submitted.',
        data: { ...newDisaster, reportCount: 1, wasMerged: false }
      });
    }

  } catch (err) {
    console.error('Create Incident API Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to create incident.'
    });
  }
};
