const mainHandler = require('../index.js');
module.exports = (req, res) => {
  const p = req.url ? req.url.split('?')[0] : '';
  req.__explicitPath = (p && p.includes('delete-all')) ? '/api/resources/delete-all' : '/api/resources/delete';
  return mainHandler(req, res);
};
