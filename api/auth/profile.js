const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/auth/profile';
  return mainHandler(req, res);
};
