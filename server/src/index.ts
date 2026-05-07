import express, { Express } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { initializeDatabase, closeDatabase } from './database';
import { initializeMailer } from './mailer';
import { errorHandler } from './middleware';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app: Express = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
  },
});

const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id}`);

  socket.on('join_room', (data) => {
    const { roomId, username } = data;
    socket.join(roomId);
    io.to(roomId).emit('user_joined', {
      username,
      message: `${username} joined the room`,
      timestamp: new Date().toISOString(),
    });
    console.log(`[SOCKET] ${username} joined room ${roomId}`);
  });

  socket.on('send_message', (data) => {
    const { roomId, username, content } = data;
    io.to(roomId).emit('receive_message', {
      id: Date.now(),
      username,
      content,
      timestamp: new Date().toISOString(),
    });
    console.log(`[SOCKET] Message in ${roomId} from ${username}`);
  });

  socket.on('send_dm', (data) => {
    const { toUserId, username, content } = data;
    io.to(toUserId).emit('receive_dm', {
      id: Date.now(),
      from: username,
      content,
      timestamp: new Date().toISOString(),
    });
    console.log(`[SOCKET] DM from ${username} to ${toUserId}`);
  });

  socket.on('video_invite', (data) => {
    const { roomId, initiatorName, invitedUserIds } = data;
    invitedUserIds.forEach((userId: string) => {
      io.to(userId).emit('video_invitation', {
        roomId,
        initiatorName,
        timestamp: new Date().toISOString(),
      });
    });
    console.log(`[SOCKET] Video invitation from ${initiatorName} in room ${roomId}`);
  });

  socket.on('video_response', (data) => {
    const { roomId, username, response } = data;
    io.to(roomId).emit('video_response_received', {
      username,
      response,
      timestamp: new Date().toISOString(),
    });
    console.log(`[SOCKET] Video response: ${username} - ${response}`);
  });

  socket.on('leave_room', (data) => {
    const { roomId, username } = data;
    socket.leave(roomId);
    io.to(roomId).emit('user_left', {
      username,
      message: `${username} left the room`,
      timestamp: new Date().toISOString(),
    });
    console.log(`[SOCKET] ${username} left room ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] User disconnected: ${socket.id}`);
  });
});

// Error handling
app.use(errorHandler);

// Initialize and start server
async function start(): Promise<void> {
  try {
    await initializeDatabase();
    initializeMailer();

    httpServer.listen(PORT, () => {
      console.log(`\n╔═══════════════════════════════════╗`);
      console.log(`║  ST-Chat Server is running! ✨    ║`);
      console.log(`║  Port: ${PORT}${PORT === 8000 ? '          ' : '        '} ║`);
      console.log(`║  http://localhost:${PORT}             ║`);
      console.log(`╚═══════════════════════════════════╝\n`);
    });
  } catch (error) {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[INFO] Shutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});

start();
