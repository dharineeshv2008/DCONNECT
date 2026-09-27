const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/pending-users';
  return mainHandler(req, res);
};
