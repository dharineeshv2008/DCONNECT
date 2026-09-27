const mainHandler = require('./index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/volunteers';
  return mainHandler(req, res);
};
