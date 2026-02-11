function getPagination(req, options) {
  const opts = options || {};
  const defaultPerPage = Number(opts.defaultPerPage || 20);
  const maxPerPage = Number(opts.maxPerPage || 100);
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const perPage = Math.min(
    maxPerPage,
    Math.max(1, parseInt(req.query.perPage || req.query.limit || String(defaultPerPage), 10)),
  );
  return { page, perPage, skip: (page - 1) * perPage };
}

module.exports = { getPagination };

