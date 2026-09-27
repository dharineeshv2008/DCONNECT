const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/users/volunteers';
  return mainHandler(req, res);
};
