const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/resources/update';
  return mainHandler(req, res);
};
