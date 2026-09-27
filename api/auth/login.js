const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/auth/login';
  return mainHandler(req, res);
};
