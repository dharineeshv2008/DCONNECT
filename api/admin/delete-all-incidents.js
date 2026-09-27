const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/delete-all-incidents';
  return mainHandler(req, res);
};
