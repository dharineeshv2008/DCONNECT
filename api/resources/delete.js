const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/resources/delete';
  return mainHandler(req, res);
};
