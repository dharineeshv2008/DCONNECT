const mainHandler = require('./index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/assignments';
  return mainHandler(req, res);
};
