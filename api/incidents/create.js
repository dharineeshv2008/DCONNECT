/**
 * Vercel Serverless Function: POST /api/incidents/create (or /api/incidents/report)
 */

const { supabaseDb } = require('../../supabaseClient');
const { sendAdminIncidentNotification } = require('../../telegramBot');

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

    const allowedTypes = ['FLOOD', 'FIRE', 'EARTHQUAKE', 'CYCLONE', 'LANDSLIDE', 'TSUNAMI', 'BUILDING_COLLAPSE', 'OTHER'];
    const rawType = (body.type || 'FLOOD').toUpperCase();
    if (!allowedTypes.includes(rawType)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: `Invalid disaster type '${body.type}'. Allowed types: ${allowedTypes.join(', ')}.`
      });
    }
    const type = rawType;

    const userLat = parseFloat(body.latitude);
    const userLon = parseFloat(body.longitude);

    if (isNaN(userLat) || isNaN(userLon)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid latitude and longitude are required.'
      });
    }

    // Task 4: Validate user before insert
    let validUserId = null;
    let reporterUser = null;
    const rawUserId = body.reporterId || body.userId || body.created_by_user_id || body.createdById;

    if (rawUserId !== undefined && rawUserId !== null && rawUserId !== '') {
      const parsedId = parseInt(rawUserId);
      if (isNaN(parsedId)) {
        console.warn(`⚠️ [Incident Create]: Invalid user ID provided: ${rawUserId}`);
        return sendJson(res, 401, {
          success: false,
          error: 'Unauthorized',
          message: 'User session invalid. Please login again.'
        });
      }

      // SELECT id FROM users WHERE id = user.id
      reporterUser = await supabaseDb.getUserById(parsedId);
      if (!reporterUser) {
        console.error(`❌ [Incident Create Error]: User ID ${parsedId} not found in users table.`);
        return sendJson(res, 401, {
          success: false,
          error: 'Unauthorized',
          message: 'User session invalid. Please login again.'
        });
      }

      validUserId = reporterUser.id;
      console.log(`👤 [Incident Create]: Validated user ID ${validUserId} (${reporterUser.name}, ${reporterUser.role}) before insert.`);
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
        reporter_id: validUserId,
        reporter_name: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen'),
        reporter_phone: reporterUser ? reporterUser.phone : (body.reporterPhone || 'N/A'),
        latitude: userLat,
        longitude: userLon,
        message: body.description || 'Incident report'
      });

      return sendJson(res, 201, {
        success: true,
        message: `Merged with existing incident ID: ${targetDisaster.id}`,
        data: { ...targetDisaster, reportCount: updatedCount, wasMerged: true }
      });
    } else {
      const roleStr = (reporterUser ? reporterUser.role : (body.role || body.userRole || '')).toUpperCase();
      let initialStatus = 'PENDING_VERIFICATION';
      if (['ADMIN', 'GOVERNMENT', 'GOVERNMENT_AGENCY', 'NGO'].includes(roleStr)) {
        initialStatus = 'VERIFIED_ACTIVE';
      }

      console.log(`👤 [Incident Create]: Inserting disaster with created_by_user_id = ${validUserId}, role = ${roleStr || 'CITIZEN'}, initialStatus = ${initialStatus}`);

      const newDisaster = await supabaseDb.createDisaster({
        type: type,
        title: body.title || `${type} Emergency`,
        description: body.description || 'Emergency reported.',
        severity: body.severity || 'UNVERIFIED',
        latitude: userLat,
        longitude: userLon,
        location_name: body.locationName || `Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`,
        status: initialStatus,
        report_count: 1,
        created_by_user_id: validUserId
      });

      await supabaseDb.createReport({
        disaster_id: newDisaster.id,
        reporter_id: validUserId,
        reporter_name: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen'),
        reporter_phone: reporterUser ? reporterUser.phone : (body.reporterPhone || 'N/A'),
        latitude: userLat,
        longitude: userLon,
        message: body.description || 'Emergency reported.'
      });

      // Send Telegram alert to admin for approval if pending verification
      sendAdminIncidentNotification({
        ...newDisaster,
        createdByName: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen')
      }).catch(err => console.warn('Telegram notification warning:', err.message));

      return sendJson(res, 201, {
        success: true,
        message: initialStatus === 'VERIFIED_ACTIVE' ? 'Disaster report published directly to live pipeline.' : 'Citizen report submitted. Awaiting Admin verification.',
        data: { ...newDisaster, reportCount: 1, wasMerged: false }
      });
    }

  } catch (err) {
    console.error('❌ [Incident Create DB Error]:', err.message || err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to create incident.'
    });
  }
};
