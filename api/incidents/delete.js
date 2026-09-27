const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/incidents/delete';
  return mainHandler(req, res);
};
