const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/resources/list';
  return mainHandler(req, res);
};
