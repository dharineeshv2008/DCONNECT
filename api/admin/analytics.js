const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/analytics';
  return mainHandler(req, res);
};
