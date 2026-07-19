// Pure-math distance calculation. No external maps API, no API key needed.

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Returns great-circle distance between two lat/long points, in kilometers.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Given a user's location and a list of offices ({latitude, longitude, ...}),
 * returns offices sorted by distance ascending, each annotated with
 * distance_km and a Google Maps link (URL pattern only, no API key required).
 */
function nearestOffices(userLat, userLon, offices, { category = null, limit = 5 } = {}) {
  const filtered = category
    ? offices.filter((o) => o.category === category)
    : offices;

  return filtered
    .map((o) => ({
      ...o,
      distance_km: Math.round(haversineDistance(userLat, userLon, o.latitude, o.longitude) * 10) / 10,
      map_link: `https://maps.google.com/?q=${o.latitude},${o.longitude}`,
      // ISRO Bhuvan's public viewer doesn't support a simple "drop a pin at
      // this lat/lon" URL without a registered API token, so this links to
      // the public geoportal itself rather than an exact-pin deep link.
      bhuvan_link: `https://bhuvan.nrsc.gov.in/ngmaps`,
    }))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
}

module.exports = { haversineDistance, nearestOffices };
