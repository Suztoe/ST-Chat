import { Router, Response } from 'express';
import {
  registerUser,
  loginUser,
  verifyEmail,
  updateTheme,
  generateVerificationToken,
} from '../auth';
import { getDatabase } from '../database';
import { authenticateToken, validateRequestBody, AuthenticatedRequest } from '../middleware';
import { sendVerificationEmail } from '../mailer';

const router = Router();

// Register
router.post(
  '/register',
  validateRequestBody(['username', 'email', 'password']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username, email, password } = req.body;
      const { user, token, verificationToken } = await registerUser(username, email, password);

      // Send verification email
      try {
        await sendVerificationEmail(email, verificationToken);
      } catch (error) {
        console.warn('[EMAIL] Failed to send verification email:', error);
      }

      res.status(201).json({
        message: 'User registered successfully. Check your email for verification link.',
        user,
        token,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Login
router.post(
  '/login',
  validateRequestBody(['email', 'password']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, password } = req.body;
      const { user, token } = await loginUser(email, password);

      res.json({
        message: 'Login successful',
        user,
        token,
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }
);

// Verify email
router.post('/verify-email', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Verification token required' });
      return;
    }

    await verifyEmail(token);

    res.json({ message: 'Email verified successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get profile
router.get('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user?.id]);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      email_verified: user.email_verified,
      theme: user.theme,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update theme
router.put('/theme', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { theme } = req.body;

    if (!theme || !['dark', 'light'].includes(theme)) {
      res.status(400).json({ error: 'Invalid theme. Must be "dark" or "light"' });
      return;
    }

    await updateTheme(req.user!.id, theme);

    res.json({ message: 'Theme updated successfully', theme });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resend verification email
router.post(
  '/resend-verification',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDatabase();
      const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user?.id]);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (user.email_verified) {
        res.status(400).json({ error: 'Email already verified' });
        return;
      }

      const verificationToken = generateVerificationToken();
      await db.run('UPDATE users SET verification_token = ? WHERE id = ?', [
        verificationToken,
        user.id,
      ]);

      try {
        await sendVerificationEmail(user.email, verificationToken);
      } catch (error) {
        console.warn('[EMAIL] Failed to send verification email:', error);
      }

      res.json({ message: 'Verification email sent' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
