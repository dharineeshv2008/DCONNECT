const { supabaseDb } = require('../../supabaseClient.js');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await supabaseDb.resetSystemData();
    return res.status(200).json({
      success: true,
      message: 'System reset completed successfully'
    });
  } catch (err) {
    console.error('System reset error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
