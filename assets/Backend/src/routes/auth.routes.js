const router = require("express").Router();
const { login, refresh, logout } = require("../controllers/auth.controller");
const { validate } = require("../middlewares/validate.middleware");
const {
  loginSchema,
  refreshSchema
} = require("../validations/auth.validation");

router.post("/login", validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refresh);
router.post("/logout", validate(refreshSchema), logout);

module.exports = router;