const weights = {
  name: 10,
  phone: 15,
  avatar: 15,
  location: 10,
  serviceType: 20,
  description: 10,
  portfolioImages: 20,
};

function isFilledString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasLocation(value) {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length === 2 && value.every((n) => Number.isFinite(n));
  if (Array.isArray(value.coordinates)) return value.coordinates.length === 2 && value.coordinates.every((n) => Number.isFinite(n));
  if (typeof value.lat === 'number' && typeof value.lng === 'number') return Number.isFinite(value.lat) && Number.isFinite(value.lng);
  return Object.keys(value).length > 0;
}

function hasServiceType(user) {
  if (isFilledString(user.serviceType)) return true;
  if (isFilledString(user.profession)) return true;
  if (Array.isArray(user.services) && user.services.length > 0) return true;
  return false;
}

function hasPortfolioImages(user) {
  if (Array.isArray(user.portfolioImages) && user.portfolioImages.length > 0) return true;
  if (Array.isArray(user.portfolio) && user.portfolio.length > 0) return true;
  return false;
}

function calculateProfileCompletion(user) {
  const data = user?.toObject ? user.toObject() : (user || {});
  const missingFields = [];
  let percent = 0;

  if (isFilledString(data.name)) percent += weights.name;
  else missingFields.push('name');

  if (isFilledString(data.phone)) percent += weights.phone;
  else missingFields.push('phone');

  if (isFilledString(data.avatar || data.photo)) percent += weights.avatar;
  else missingFields.push('avatar');

  if (hasLocation(data.location)) percent += weights.location;
  else missingFields.push('location');

  if (hasServiceType(data)) percent += weights.serviceType;
  else missingFields.push('serviceType');

  if (isFilledString(data.description)) percent += weights.description;
  else missingFields.push('description');

  if (hasPortfolioImages(data)) percent += weights.portfolioImages;
  else missingFields.push('portfolioImages');

  percent = Math.max(0, Math.min(100, Math.round(percent)));

  return { percent, missingFields };
}

module.exports = { calculateProfileCompletion };