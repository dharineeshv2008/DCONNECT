const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/approve-user';
  return mainHandler(req, res);
};
