const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/auth/me';
  return mainHandler(req, res);
};
