const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Minimum User model required by the Login / Authenticate / Refresh / Logout
// flow, verified against the existing RN frontend contract:
//   User.{ _id, gymId, branchCode, name, email, phone, role, status }
//   plus password (bcrypt) and refreshTokens (rotation + revocation).
// Note: email is lowercased at the schema level - the same normalization the
// RN client applies before sending, so lookup and storage always match.

const userSchema = new mongoose.Schema(
  {
    gymId: { type: String, required: true, index: true },
    branchCode: { type: String, default: "MAIN", index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, minlength: 6 },
    role: {
      type: String,
      enum: ["superadmin", "admin", "trainer", "member"],
      default: "member",
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "active", "inactive"],
      default: "active",
      index: true
    },
    photo: String,
    address: { type: String, trim: true },
    emergencyContact: { type: String, trim: true },
    refreshTokens: [{ type: String }]
  },
  { timestamps: true }
);

// One email per gym (matches the reference index).
userSchema.index(
  { gymId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } }
  }
);

userSchema.pre("save", async function preSave(next) {
  if (!this.isModified("password")) return next();
  if (!this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(input) {
  return bcrypt.compare(input, this.password);
};

module.exports = mongoose.model("User", userSchema);