const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/delete-all-resources';
  return mainHandler(req, res);
};
