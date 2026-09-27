const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/incidents/delete-all';
  return mainHandler(req, res);
};
