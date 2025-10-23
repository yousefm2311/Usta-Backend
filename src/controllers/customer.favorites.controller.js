const Favorite = require('../models/favorite.model');
const Artisan = require('../models/artisan.model');

async function addFavorite(req, res) {
  const { artisanId } = req.params;
  try { await Favorite.create({ customerId: req.user._id, artisanId }); } catch (_) {}
  return res.json({ ok: true });
}

async function listFavorites(req, res) {
  const favs = await Favorite.find({ customerId: req.user._id });
  const ids = favs.map((f) => f.artisanId);
  const artisans = ids.length ? await Artisan.find({ _id: { $in: ids } }).select('-password') : [];
  return res.json({ favorites: artisans });
}

async function removeFavorite(req, res) {
  const { artisanId } = req.params;
  await Favorite.deleteOne({ customerId: req.user._id, artisanId });
  return res.json({ ok: true });
}

module.exports = { addFavorite, listFavorites, removeFavorite };

