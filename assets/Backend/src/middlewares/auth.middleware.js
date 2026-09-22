const { AppError } = require("../utils/appError");

// Public contract (verified from the RN frontend):
// * Bearer access token -> jwt.verify with JWT_ACCESS_SECRET
// * loads the full user via findById(decoded.sub), minus password/refreshTokens
// * blocks deactivated accounts (status === "inactive") with 403
// * attaches { req.user, req.gymId }
// Members require a Member-profile status check in the reference app; the RN
// "Staff Access" login only ever authenticates admin/superadmin, so the Member
// lookup is intentionally not modelled here (out of scope for login/auth).

const protect = async (req, _res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
  }

  try {
    const jwt = require("jsonwebtoken");
    const User = require("../models/User");
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.sub).select("-password -refreshTokens");
    if (!user) throw new Error("User not found");

    if (user.status === "inactive") {
      return next(
        new AppError(
          "Your account has been deactivated. Please contact admin.",
          403,
          "FORBIDDEN"
        )
      );
    }

    req.user = user;
    req.gymId = user.gymId;
    next();
  } catch {
    next(new AppError("Invalid token", 401, "UNAUTHORIZED"));
  }
};

module.exports = { protect };