const { supabaseDb } = require('../../supabaseClient.js');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = {};
  if (req.body && typeof req.body === 'object') {
    body = req.body;
  } else {
    let raw = '';
    await new Promise((resolve) => {
      req.on('data', chunk => raw += chunk);
      req.on('end', () => {
        try { body = raw ? JSON.parse(raw) : {}; } catch (e) { body = {}; }
        resolve();
      });
      req.on('error', () => resolve());
    });
  }

  const target = String(body.target || req.query?.target || req.query?.type || 'all').toLowerCase();

  try {
    if (target === 'disasters' || target === 'incidents') {
      const deleted = await supabaseDb.deleteAllDisasters();
      return res.status(200).json({
        success: true,
        message: 'All disaster incidents deleted successfully.',
        count: deleted ? deleted.length : 0
      });
    }

    if (target === 'resources') {
      const deleted = await supabaseDb.deleteAllResources();
      return res.status(200).json({
        success: true,
        message: 'All emergency resource supply posts deleted successfully.',
        count: deleted ? deleted.length : 0
      });
    }

    await supabaseDb.resetSystemData();
    return res.status(200).json({
      success: true,
      message: 'System reset completed successfully'
    });
  } catch (err) {
    console.error('Reset handler error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
