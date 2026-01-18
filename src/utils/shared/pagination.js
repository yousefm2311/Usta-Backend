function getPagination(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(req.query.perPage || req.query.limit || "20", 10))
  );
  return { page, perPage, skip: (page - 1) * perPage };
}

module.exports = { getPagination };

