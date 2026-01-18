function dataResponse(data, meta) {
  if (meta) return { data, meta };
  return { data };
}

function paginatedResponse(items, total, page, perPage) {
  return {
    data: items,
    pagination: {
      total,
      page,
      perPage,
    },
  };
}

module.exports = { dataResponse, paginatedResponse };

