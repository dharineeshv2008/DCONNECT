const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/incidents/edit';
  return mainHandler(req, res);
};
