const mainHandler = require('./index.js');
module.exports = (req, res) => {
  return mainHandler(req, res);
};
