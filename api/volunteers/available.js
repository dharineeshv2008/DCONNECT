const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/volunteers/available';
  return mainHandler(req, res);
};
