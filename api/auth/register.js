const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/auth/register';
  return mainHandler(req, res);
};
