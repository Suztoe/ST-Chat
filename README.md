
 ---**This App INFO**---


 ST‑Chat UI Layout:

    Left (User Info): Always visible. Shows user profile and settings.

    Center (Main View): Switches between Home and Chat.

    Right (Rooms): Visible only in Chat mode. Hidden on Home.

    Top (User Count): Shows online users in the current room.

ST‑Chat is a lightweight, fast, and stable chat application designed to provide a clean and simple user experience across all platforms.  

Instead of copying the complexity and heaviness of modern chat apps, ST‑Chat focuses on the essentials: speed, clarity, and reliability.

*Core Goals*:

    Cross‑platform:  
    Works consistently on Web, Tauri, Windows, macOS, Linux, iOS, and Android.

    Stability:  
    Built on a simple WebSocket + JSON protocol with automatic reconnection and predictable behavior.

    Lightweight & Simple UX:  
    Faster and cleaner than Discord — no unnecessary animations, no clutter, and optimized for low‑spec devices.

*Why ST‑Chat Exists*

Modern chat apps tend to be heavy, slow, or overly complex.
ST‑Chat aims to be the opposite: minimal, fast, and easy to understand, while still being extensible and open for future features like bots or custom clients.

How To Execute:

server.py:

uvicorn server:app --reload

Tauri:

npm run tauri dev



