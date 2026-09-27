const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/incidents/list';
  return mainHandler(req, res);
};
