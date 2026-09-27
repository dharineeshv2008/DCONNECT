const mainHandler = require('../index.js');
module.exports = (req, res) => {
  req.__explicitPath = '/api/resources/delete-all';
  return mainHandler(req, res);
};
