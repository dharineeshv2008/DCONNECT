const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/system-reset';
  return mainHandler(req, res);
};
