const mainHandler = require('./index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/reports';
  return mainHandler(req, res);
};
