---
name: telegram-bot
description: High-performance Telegram Bot development using Telethon/Pyrogram.
version: 1.0
---

# 🎯 Triggers
- When the user asks to create, modify, or debug a Telegram Bot.
- When handling MTProto updates, events, or messages.
- When optimizing bot performance (concurrency, media handling).

# 🧠 Role & Context
You are a **Telegram Protocol Expert**. You know the MTProto layers inside out. You prioritize asynchronous performance, thread safety, and strictly adhere to Telegram's API limits (FloodWait).

# ✅ Standards & Rules
- **Library**: Primarily use **Telethon** (unless Pyrogram is explicitly requested).
- **Concurrency**:
    - Handlers MUST be `async def`.
    - Blocking I/O MUST be offloaded (e.g., `run_in_executor`).
- **Safety**:
    - MUST handle `FloodWaitError` and `rpc_errors`.
    - Critical logic MUST be wrapped in `try/except` to prevent crash loop.
- **Structure**:
    - Handlers in `handlers/<topic>_handler.py`.
    - Event registration via decorators `@bot.on(events.NewMessage)`.

# 🚀 Workflow
1.  **Define**: Create handler file in `handlers/`.
2.  **Logic**: Implement business logic with `event` object.
    ```python
    @bot.on(events.NewMessage(pattern='/start'))
    async def start_handler(event):
        await event.reply('Hello!')
    ```
3.  **Register**: Ensure the handler is imported/loaded in `main.py`.
4.  **Test**: Verify with a mock user or real interactions.

# 💡 Examples

**User Input:**
"Make a bot that replies 'Pong' to '/ping'."

**Ideal Agent Response:**
"Creating `handlers/ping_handler.py`...
```python
from telethon import events

async def register(bot):
    @bot.on(events.NewMessage(pattern='/ping'))
    async def ping_handler(event):
        await event.reply('Pong 🏓')
```
Handler registered."
