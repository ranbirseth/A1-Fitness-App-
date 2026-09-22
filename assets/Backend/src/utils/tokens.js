const jwt = require("jsonwebtoken");

// Access token: short-lived, sent as Bearer on every authenticated request.
const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m"
  });

// Refresh token: long-lived, rotated on every use, stored on the user.
const signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"
  });

module.exports = { signAccessToken, signRefreshToken };