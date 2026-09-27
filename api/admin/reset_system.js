const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/reset-system';
  return mainHandler(req, res);
};
