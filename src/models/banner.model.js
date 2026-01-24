const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    image: { type: String, trim: true },
    gradientColors: [{ type: String, trim: true }],
    actionType: {
      type: String,
      enum: ['none', 'open_url', 'open_screen', 'apply_coupon'],
      default: 'none',
    },
    actionValue: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    priority: { type: Number, default: 0 },
    targetCities: [{ type: String, trim: true }],
    targetCategories: [{ type: String, trim: true }],
    targetUserType: {
      type: String,
      enum: ['all', 'new_users', 'returning_users'],
      default: 'all',
    },
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, startAt: 1, endAt: 1, priority: -1 });

module.exports = mongoose.model('Banner', bannerSchema);
