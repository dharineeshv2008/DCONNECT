const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/incidents/create';
  return mainHandler(req, res);
};
