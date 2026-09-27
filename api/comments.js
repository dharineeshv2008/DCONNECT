const mainHandler = require('./index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/comments';
  return mainHandler(req, res);
};
