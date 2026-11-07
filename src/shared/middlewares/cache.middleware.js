/**
 * Sets Edge CDN and browser cache headers for read-only public endpoints.
 * @param {object} options
 * @param {number} [options.maxAge=60] Browser cache in seconds
 * @param {number} [options.sMaxAge=300] Shared Edge CDN cache in seconds
 * @param {number} [options.staleWhileRevalidate=600] Serve stale content while fetching fresh data in background
 */
export const cacheControl = ({ maxAge = 60, sMaxAge = 300, staleWhileRevalidate = 600 } = {}) => {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
      );
    }
    next();
  };
};

