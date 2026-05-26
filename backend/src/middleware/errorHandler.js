const errorHandler = (err, req, res, next) => {
  console.error('[TMS Error]', err);
  const status  = err.statusCode || err.status || 500;
  const message = err.message    || 'Internal server error';
  res.status(status).json({ message, ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) });
};

module.exports = { errorHandler };
