"""
ST-Chat Backend Server
FastAPI + WebSocket チャットサーバー
"""

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
from collections import deque
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Room data structure
rooms = {}
# { "room_name": { "clients": set(), "key": str, "private": bool, "history": deque } }


@app.get("/rooms")
def get_rooms():
    """Get all available rooms"""
    try:
        return [{"name": r, "private": rooms[r]["private"]} for r in rooms]
    except Exception as e:
        logger.error(f"Error getting rooms: {e}")
        return []


@app.post("/create_room")
async def create_room(data: dict):
    """Create a new room"""
    try:
        name = data.get("name", "").strip()
        key = data.get("key", "")

        if not name:
            raise HTTPException(status_code=400, detail="Room name required")

        if name in rooms:
            raise HTTPException(status_code=400, detail="Room already exists")

        rooms[name] = {
            "clients": set(),
            "private": bool(key),
            "key": key,
            "history": deque(maxlen=100),  # Keep last 100 messages
        }

        logger.info(f"Room created: {name} (private={bool(key)})")
        return {"ok": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating room: {e}")
        raise HTTPException(status_code=500, detail="Failed to create room")


@app.websocket("/ws/{room}")
async def websocket_endpoint(websocket: WebSocket, room: str):
    """WebSocket connection handler"""
    try:
        await websocket.accept()
        logger.info(f"Connection request: {room}")

        # Receive client info
        try:
            client_data = json.loads(await websocket.receive_text())
        except Exception as e:
            logger.error(f"Failed to parse client data: {e}")
            await websocket.close(code=4000, reason="Invalid data")
            return

        name = client_data.get("name", "Anonymous")
        key = client_data.get("key", "")

        # Check room exists
        if room not in rooms:
            logger.warning(f"Room not found: {room}")
            await websocket.close(code=4001, reason="Room not found")
            return

        r = rooms[room]

        # Check password
        if r["private"] and r["key"] != key:
            logger.warning(f"Invalid password: {room}")
            await websocket.close(code=4002, reason="Invalid password")
            return

        r["clients"].add(websocket)
        logger.info(
            f"User joined: {name} ({room}) - Total: {len(r['clients'])}"
        )

        # Send message history
        for msg in r["history"]:
            try:
                await websocket.send_text(msg)
            except Exception as e:
                logger.error(f"Error sending history: {e}")

        # Broadcast user count
        async def broadcast_count():
            count = len(r["clients"])
            msg = json.dumps({"type": "users", "count": count})
            disconnected = set()
            for client in r["clients"]:
                try:
                    await client.send_text(msg)
                except Exception:
                    disconnected.add(client)
            for client in disconnected:
                r["clients"].discard(client)

        await broadcast_count()

        # Message loop
        try:
            while True:
                msg = await websocket.receive_text()

                # Save to history
                r["history"].append(msg)

                # Broadcast to all clients
                disconnected = set()
                for client in r["clients"]:
                    try:
                        await client.send_text(msg)
                    except Exception:
                        disconnected.add(client)

                # Remove disconnected clients
                for client in disconnected:
                    r["clients"].discard(client)

                if disconnected:
                    await broadcast_count()

        except Exception as e:
            logger.error(f"Connection error: {e}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}")

    finally:
        try:
            r = rooms.get(room)
            if r:
                r["clients"].discard(websocket)
                logger.info(
                    f"User left: {room} - Remaining: {len(r['clients'])}"
                )

                # Notify remaining users
                if r["clients"]:
                    count = len(r["clients"])
                    msg = json.dumps({"type": "users", "count": count})
                    for client in list(r["clients"]):
                        try:
                            await client.send_text(msg)
                        except Exception:
                            pass
        except Exception as e:
            logger.error(f"Cleanup error: {e}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)