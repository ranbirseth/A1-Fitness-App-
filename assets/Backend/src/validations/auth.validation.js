const { z } = require("zod");

// Mirrors the reference server's login contract exactly:
//   body { gymId, email, password } required; `role` is intentionally NOT in
//   the body schema. Zod strips extra keys from its parsed output but the
//   controller reads req.body (which still contains role), preserving the
//   existing behavior where role is an optional query filter.

const loginSchema = z.object({
  body: z.object({
    gymId: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6)
  }),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough()
});

const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().optional() }).optional(),
  query: z.object({}).passthrough(),
  params: z.object({}).passthrough()
});

module.exports = { loginSchema, refreshSchema };