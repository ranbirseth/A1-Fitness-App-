const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { asyncHandler } = require("../utils/asyncHandler");
const { sendResponse } = require("../utils/response");
const { signAccessToken, signRefreshToken } = require("../utils/tokens");
const { AppError } = require("../utils/appError");

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const toTokens = (user) => {
  const payload = { sub: user._id, role: user.role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload)
  };
};

const sanitizeUser = (user) => ({
  _id: user._id,
  gymId: user.gymId,
  branchCode: user.branchCode || "MAIN",
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  photo: user.photo,
  address: user.address,
  emergencyContact: user.emergencyContact,
  status: user.status,
  paymentStatus: "paid",
  secretCode: undefined
});

const setRefreshCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_COOKIE_MAX_AGE
  });
};

const clearRefreshCookie = (res) => res.clearCookie("refreshToken");

const getRefreshToken = (req) =>
  req.cookies?.refreshToken || req.body?.refreshToken;

// POST /login
const login = asyncHandler(async (req, res) => {
  const { gymId, email, password, role } = req.body;
  const query = { gymId, email };
  if (role) query.role = role;

  const user = await User.findOne(query);
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }

  if (user.status === "inactive") {
    throw new AppError(
      "Your account has been deactivated. Please contact admin.",
      403,
      "ACCOUNT_INACTIVE"
    );
  }

  const tokens = toTokens(user);
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  setRefreshCookie(res, tokens.refreshToken);

  sendResponse(res, {
    message: "Login successful",
    data: {
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  });
});

// POST /refresh
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = getRefreshToken(req);
  if (!refreshToken) {
    throw new AppError("Refresh token required", 401, "REFRESH_TOKEN_REQUIRED");
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError("Invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
  }

  const user = await User.findById(decoded.sub);
  if (!user || !user.refreshTokens.includes(refreshToken)) {
    throw new AppError("Refresh token revoked", 401, "REFRESH_TOKEN_REVOKED");
  }

  const tokens = toTokens(user);
  user.refreshTokens = user.refreshTokens.slice(-4);
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  setRefreshCookie(res, tokens.refreshToken);

  sendResponse(res, {
    message: "Token refreshed",
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  });
});

// POST /logout
const logout = asyncHandler(async (req, res) => {
  const refreshToken = getRefreshToken(req);
  if (!refreshToken) {
    throw new AppError(
      "Refresh token required for logout",
      401,
      "REFRESH_TOKEN_REQUIRED"
    );
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    // Invalid/expired token: still clear the cookie and report success so the
    // client always ends up without a server-side session.
    clearRefreshCookie(res);
    return sendResponse(res, { message: "Logout successful", data: {} });
  }

  const user = await User.findById(decoded.sub);
  if (user) {
    user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
    await user.save();
  }

  clearRefreshCookie(res);
  sendResponse(res, { message: "Logout successful", data: {} });
});

module.exports = { login, refresh, logout };