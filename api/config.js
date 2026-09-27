const mainHandler = require('./index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/config';
  return mainHandler(req, res);
};
