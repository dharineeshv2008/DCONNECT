const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/approve-disaster';
  return mainHandler(req, res);
};
