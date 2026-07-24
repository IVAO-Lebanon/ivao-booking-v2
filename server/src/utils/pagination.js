const MAX_PER_PAGE = 25;

export function parsePagination(query, defaultPerPage = 10) {
  let perPage = parseInt(query.perPage, 10);
  if (!Number.isFinite(perPage) || perPage < 1) perPage = defaultPerPage;
  if (perPage > MAX_PER_PAGE) perPage = MAX_PER_PAGE;

  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  return { page, perPage, offset: (page - 1) * perPage };
}

export function paginated(data, total, page, perPage) {
  return {
    data,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}
