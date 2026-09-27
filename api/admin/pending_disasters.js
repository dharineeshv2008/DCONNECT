const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/admin/pending-disasters';
  return mainHandler(req, res);
};
