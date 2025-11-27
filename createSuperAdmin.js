const mongoose = require("mongoose");
const Admin = require("../Usta-Backend/src/models/admin.model.js"); // عدّل لو المسار مختلف
const bcrypt = require("bcryptjs");

async function createInitialSuperAdmin() {
  try {
    await mongoose.connect("mongodb://172.17.100.6:27017/usta"); // عدّل اسم الداتابيز لو محتاج

    const exists = await Admin.findOne({ role: "super", deleted: false });
    if (exists) {
      console.log("Super admin already exists.");
      process.exit(0);
    }

    const password = "17479191"; // ممكن تغيره قبل ما تشغّل السكريبت
    const hashed = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      name: "Super Admin",
      email: "superadmin@usta.com",
      password: hashed,
      role: "super",
    });

    console.log("✓ Super Admin Created Successfully!");
    console.log("Email:", admin.email);
    console.log("Password:", password);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

createInitialSuperAdmin();
