const mainHandler = require('./index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/disasters';
  return mainHandler(req, res);
};
