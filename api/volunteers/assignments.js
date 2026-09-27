const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/volunteers/assignments';
  return mainHandler(req, res);
};
