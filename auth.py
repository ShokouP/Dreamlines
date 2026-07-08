"""Simple token-based authentication for CardForge SDD."""

import hashlib
import secrets
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from functools import wraps

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

DATA_DIR = Path(__file__).parent / "data"
PLAYERS_DIR = DATA_DIR / "players"

# In-memory session store: token -> user dict
_sessions: dict[str, dict] = {}


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _load_user(user_id: str) -> Optional[dict]:
    path = PLAYERS_DIR / f"{user_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _save_user(user: dict) -> None:
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    path = PLAYERS_DIR / f"{user['id']}.json"
    path.write_text(json.dumps(user, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _ensure_default_admin():
    """Create default admin user if not exists.

    Password is taken from the ADMIN_PASSWORD env var; defaults to 'admin'
    with a warning (local dev only). On public deploy, always set ADMIN_PASSWORD.
    """
    path = PLAYERS_DIR / "admin.json"
    if path.exists():
        return
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    import os
    admin_pw = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_pw:
        print("⚠️  ADMIN_PASSWORD not set — using default 'admin'. "
              "Set the ADMIN_PASSWORD env var before public deploy.")
        admin_pw = "admin"
    admin = {
        "id": "admin",
        "username": "admin",
        "passwordHash": _hash_password(admin_pw),
        "role": "admin",
        "displayName": "Administrator",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    _save_user(admin)


def _generate_id_from_username(username: str) -> str:
    """Generate a URL-safe id from username."""
    import re
    base = re.sub(r"[^a-zA-Z0-9_-]", "", username).lower()
    return base[:30] or secrets.token_hex(4)


def register_user(username: str, password: str, display_name: str = "") -> Optional[dict]:
    """Create a new player account and return user dict with token."""
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    username = username.strip()
    if not username:
        raise ValueError("用户名不能为空")
    if len(username) < 3 or len(username) > 30:
        raise ValueError("用户名长度须在 3-30 字符之间")
    if not password or len(password) < 6:
        raise ValueError("密码至少 6 位")

    # Check uniqueness by username
    for f in PLAYERS_DIR.glob("*.json"):
        user = json.loads(f.read_text(encoding="utf-8"))
        if user.get("username", "").lower() == username.lower():
            raise ValueError(f"用户名 '{username}' 已被占用")

    user_id = _generate_id_from_username(username)
    # If generated id collides, append random suffix
    while (_load_user(user_id)):
        user_id = f"{user_id}_{secrets.token_hex(2)}"

    player = {
        "id": user_id,
        "username": username,
        "passwordHash": _hash_password(password),
        "role": "player",
        "displayName": display_name.strip() or username,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "totalMatches": 0, "wins": 0, "losses": 0, "winRate": 0,
            "favoriteCharacter": "", "favoriteCard": "",
            "totalDamageDealt": 0, "totalDamageTaken": 0, "highestDamageTurn": 0,
        },
        "collection": {"unlockedCharacters": [], "unlockedCards": []},
        "avatarUrl": "",
    }
    _save_user(player)
    token = secrets.token_hex(32)
    _sessions[token] = player
    result = dict(player)
    result["token"] = token
    result.pop("passwordHash", None)
    return result


def authenticate(username: str, password: str) -> Optional[dict]:
    """Validate credentials and return user dict with token, or None."""
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    for f in PLAYERS_DIR.glob("*.json"):
        user = json.loads(f.read_text(encoding="utf-8"))
        if user.get("username") == username:
            if user.get("passwordHash") == _hash_password(password):
                token = secrets.token_hex(32)
                _sessions[token] = user
                result = dict(user)
                result["token"] = token
                result.pop("passwordHash", None)
                return result
            return None
    return None


def logout(token: str) -> None:
    _sessions.pop(token, None)


def get_current_user(request: Request) -> dict:
    """Extract current user from Authorization header or cookie."""
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = request.cookies.get("cf_token")

    if not token or token not in _sessions:
        raise HTTPException(401, "Not authenticated")
    user = _sessions[token]
    return {k: v for k, v in user.items() if k != "passwordHash"}


def require_role(*roles: str):
    """Decorator: require one of the given roles to access the endpoint."""
    def decorator(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            # Find the Request object in args or kwargs
            request = None
            for a in args:
                if isinstance(a, Request):
                    request = a
                    break
            if request is None:
                request = kwargs.get("request")
            if request is None:
                raise HTTPException(500, "Request not found in endpoint signature")
            user = get_current_user(request)
            if user["role"] not in roles:
                raise HTTPException(403, f"Role {user['role']} not allowed; required: {', '.join(roles)}")
            return await fn(*args, **kwargs)
        return wrapper
    return decorator


def require_role_sync(*roles: str):
    """Sync variant for use inside FastAPI endpoint bodies."""
    def check(request: Request):
        user = get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(403, f"Role {user['role']} not allowed; required: {', '.join(roles)}")
        return user
    return check
