const mainHandler = require('./index.js');
module.exports = (req, res) => {
  if (req.query && req.query.path) {
    const p = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path);
    req.__explicitPath = '/api/' + p;
  }
  return mainHandler(req, res);
};
