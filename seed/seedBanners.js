require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const Banner = require('../src/models/banner.model');

async function seed() {
  const uri = process.env.MONGODB_URI || config.mongodbUri;
  const dbName = process.env.DB_NAME || config.dbName;

  await mongoose.connect(uri, { dbName });

  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const banners = [
    {
      title: 'First Order Discount',
      subtitle: 'Save 20% on your first request',
      image: 'https://cdn.example.com/banners/first-order.png',
      gradientColors: ['#2563EB', '#111827'],
      actionType: 'apply_coupon',
      actionValue: 'WELCOME20',
      isActive: true,
      startAt: now,
      endAt: nextMonth,
      priority: 100,
      targetUserType: 'new_users',
    },
    {
      title: 'Sponsored Partner',
      subtitle: 'Check out our official partner',
      image: 'https://cdn.example.com/banners/sponsor.png',
      gradientColors: ['#16A34A', '#0F172A'],
      actionType: 'open_url',
      actionValue: 'https://sponsor.example.com',
      isActive: true,
      startAt: now,
      endAt: nextMonth,
      priority: 50,
      targetUserType: 'all',
    },
    {
      title: 'Maintenance Notice',
      subtitle: 'Scheduled maintenance this week',
      image: 'https://cdn.example.com/banners/maintenance.png',
      gradientColors: ['#F59E0B', '#7C2D12'],
      actionType: 'none',
      actionValue: null,
      isActive: true,
      startAt: now,
      endAt: nextWeek,
      priority: 10,
      targetUserType: 'all',
    },
  ];

  await Promise.all(
    banners.map((banner) =>
      Banner.findOneAndUpdate(
        { title: banner.title },
        banner,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );

  console.log(`Seeded ${banners.length} banners.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
