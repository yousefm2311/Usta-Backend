const { assertObjectId } = require("../../utils/shared/objectId");
const Category = require("../../models/category.model");

async function listCategories(req, res) {
  const rows = await Category.find({}).sort({ name: 1 });
  return res.json({ categories: rows });
}

async function createCategory(req, res) {
  const doc = await Category.create({ name: req.body.name });
  return res.status(201).json({ category: doc });
}

async function updateCategory(req, res) {
  assertObjectId(req.params.id, "categoryId");
  await Category.updateOne(
    { _id: req.params.id },
    { $set: { name: req.body.name } }
  );
  return res.json({ ok: true });
}

async function deleteCategory(req, res) {
  assertObjectId(req.params.id, "categoryId");
  await Category.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};

