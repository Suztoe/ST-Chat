import { Router, Response } from 'express';
import { getDatabase } from '../database';
import { hashPassword, comparePassword } from '../auth';
import { authenticateToken, validateRequestBody, AuthenticatedRequest } from '../middleware';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all rooms
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    const rooms = await db.all(
      `SELECT r.id, r.name, r.description, r.owner_id, r.is_private, 
              (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count
       FROM rooms r`
    );

    res.json(rooms);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create room
router.post(
  '/',
  authenticateToken,
  validateRequestBody(['name']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, description, is_private, password } = req.body;
      const db = getDatabase();

      // Check if room already exists
      const existingRoom = await db.get('SELECT id FROM rooms WHERE name = ?', [name]);
      if (existingRoom) {
        res.status(400).json({ error: 'Room already exists' });
        return;
      }

      const roomId = uuidv4();
      let passwordHash = null;

      if (is_private && password) {
        passwordHash = await hashPassword(password);
      }

      await db.run(
        `INSERT INTO rooms (id, name, description, owner_id, is_private, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roomId, name, description || null, req.user!.id, is_private ? 1 : 0, passwordHash]
      );

      // Add owner as member
      await db.run(
        `INSERT INTO room_members (id, room_id, user_id) VALUES (?, ?, ?)`,
        [uuidv4(), roomId, req.user!.id]
      );

      res.status(201).json({
        message: 'Room created successfully',
        room: {
          id: roomId,
          name,
          description,
          owner_id: req.user!.id,
          is_private,
          member_count: 1,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get room details
router.get('/:roomId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const db = getDatabase();

    const room = await db.get(
      `SELECT r.*, (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count
       FROM rooms r WHERE r.id = ?`,
      [roomId]
    );

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    res.json(room);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify room password
router.post(
  '/:roomId/verify-password',
  validateRequestBody(['password']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const { password } = req.body;
      const db = getDatabase();

      const room = await db.get('SELECT * FROM rooms WHERE id = ?', [roomId]);

      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      if (!room.is_private) {
        res.json({ valid: true });
        return;
      }

      if (!room.password_hash) {
        res.json({ valid: true });
        return;
      }

      const isValid = await comparePassword(password, room.password_hash);

      if (!isValid) {
        res.status(401).json({ error: 'Invalid password' });
        return;
      }

      res.json({ valid: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Join room
router.post(
  '/:roomId/join',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const db = getDatabase();

      const room = await db.get('SELECT * FROM rooms WHERE id = ?', [roomId]);

      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      // Check if already member
      const existingMember = await db.get(
        'SELECT id FROM room_members WHERE room_id = ? AND user_id = ?',
        [roomId, req.user!.id]
      );

      if (existingMember) {
        res.json({ message: 'Already a member of this room' });
        return;
      }

      await db.run(
        `INSERT INTO room_members (id, room_id, user_id) VALUES (?, ?, ?)`,
        [uuidv4(), roomId, req.user!.id]
      );

      res.status(201).json({ message: 'Joined room successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete room (owner only)
router.delete('/:roomId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const db = getDatabase();

    const room = await db.get('SELECT * FROM rooms WHERE id = ?', [roomId]);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.owner_id !== req.user!.id) {
      res.status(403).json({ error: 'Only room owner can delete the room' });
      return;
    }

    await db.run('DELETE FROM rooms WHERE id = ?', [roomId]);

    res.json({ message: 'Room deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get room members
router.get('/:roomId/members', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const db = getDatabase();

    const members = await db.all(
      `SELECT u.id, u.username, u.avatar_url
       FROM room_members rm
       JOIN users u ON rm.user_id = u.id
       WHERE rm.room_id = ?`,
      [roomId]
    );

    res.json(members);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
