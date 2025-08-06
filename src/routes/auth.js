import express from "express";
import { login, refreshToken, register } from "#controllers/AuthController.js";
import { validateInput } from "#middleware/index.js";
import { loginSchema, registerSchema } from "#validations/auth.js";

const router = express.Router();

router.post("/login", validateInput(loginSchema), login);
router.post("/register", validateInput(registerSchema), register);
router.post("/refresh-token", refreshToken);

export default router;
