const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/reject-user';
  return mainHandler(req, res);
};
