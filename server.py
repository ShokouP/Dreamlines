"""CardForge SDD Management Backend — FastAPI server."""

import asyncio
import hashlib
import io
import json
import os
import secrets
import shutil
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from schemas import CardRow, EffectRow, BuffRow, CharacterRow, GameModeRow, KeywordRow
from auth import (
    _ensure_default_admin, _load_user, _save_user, _hash_password,
    authenticate, logout, get_current_user, require_role, require_role_sync, register_user,
)

app = FastAPI(title="CardForge SDD Management")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DATA_DIR = Path(__file__).parent / "data"
BACKUP_DIR = DATA_DIR / ".backups"
PLAYERS_DIR = DATA_DIR / "players"
MATCHES_DIR = DATA_DIR / "matches"

TABLES = {
    "cards": ("cards.json", CardRow),
    "effects": ("effects.json", EffectRow),
    "buffs": ("buffs.json", BuffRow),
    "characters": ("characters.json", CharacterRow),
    "game-modes": ("game_modes.json", GameModeRow),
    "keywords": ("keywords.json", KeywordRow),
}

# Ensure default admin on startup
_ensure_default_admin()


def _read_table(name: str) -> list[dict]:
    filename, _ = TABLES[name]
    path = DATA_DIR / filename
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _backup(filename: str) -> None:
    BACKUP_DIR.mkdir(exist_ok=True)
    src = DATA_DIR / filename
    if not src.exists():
        return
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(src, BACKUP_DIR / f"{filename}.{ts}.bak")


def _write_table(name: str, rows: list[dict]) -> None:
    filename, schema = TABLES[name]
    for row in rows:
        schema.model_validate(row)
    _backup(filename)
    (DATA_DIR / filename).write_text(
        json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _validate_refs() -> list[str]:
    errors: list[str] = []
    cards = {r["id"] for r in _read_table("cards")}
    effects = {r["id"] for r in _read_table("effects")}
    buffs = {r["id"] for r in _read_table("buffs")}
    for card in _read_table("cards"):
        for inv in card.get("effects", []):
            eid = inv.get("effectId", "")
            if eid and eid not in effects:
                errors.append(f"Card '{card['id']}' references unknown effect '{eid}'")
            buff_ref = inv.get("parameters", {}).get("buffId_ref", "")
            if buff_ref and buff_ref not in buffs:
                errors.append(f"Card '{card['id']}' references unknown buff '{buff_ref}'")
    for char in _read_table("characters"):
        for cid in char.get("startingDeck", []):
            if cid not in cards:
                errors.append(f"Character '{char['id']}' references unknown card '{cid}'")
        for bid in char.get("innateBuffIds", []):
            if bid not in buffs:
                errors.append(f"Character '{char['id']}' references unknown buff '{bid}'")
    return errors


# ── Auth endpoints ──

@app.post("/api/auth/login")
async def auth_login(body: dict[str, str]):
    username = body.get("username", "")
    password = body.get("password", "")
    user = authenticate(username, password)
    if not user:
        raise HTTPException(401, "Invalid credentials")
    return user


@app.post("/api/auth/logout")
async def auth_logout(request: Request):
    token = request.cookies.get("cf_token") or request.headers.get("Authorization", "").removeprefix("Bearer ")
    if token:
        logout(token)
    return {"status": "ok"}


@app.get("/api/auth/me")
async def auth_me(request: Request):
    return get_current_user(request)


@app.post("/api/auth/register")
async def auth_register(body: dict[str, str]):
    username = body.get("username", "")
    password = body.get("password", "")
    display_name = body.get("displayName", "")
    try:
        user = register_user(username, password, display_name)
        return user
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Data table endpoints (admin only) ──

@app.get("/api/validate/refs")
async def validate_refs(request: Request):
    get_current_user(request)
    return {"valid": len(errors := _validate_refs()) == 0, "errors": errors}


@app.get("/api/export")
async def export_data(request: Request):
    get_current_user(request)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for _, (filename, _) in TABLES.items():
            p = DATA_DIR / filename
            if p.exists():
                zf.write(p, filename)
    buf.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": "attachment; filename=cardforge-data.zip"})


# ── Player endpoints ──

def _list_players() -> list[dict]:
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    players = []
    for f in PLAYERS_DIR.glob("*.json"):
        p = json.loads(f.read_text(encoding="utf-8"))
        p.pop("passwordHash", None)
        players.append(p)
    return players


@app.get("/api/players")
async def list_players(request: Request):
    user = require_role_sync("admin")(request)
    return _list_players()


@app.get("/api/players/{player_id}")
async def get_player(player_id: str, request: Request):
    user = get_current_user(request)
    if user["role"] != "admin" and user["id"] != player_id:
        raise HTTPException(403, "Access denied")
    p = _load_user(player_id)
    if not p:
        raise HTTPException(404, f"Player not found: {player_id}")
    p.pop("passwordHash", None)
    return p


@app.put("/api/players/{player_id}")
async def update_player(player_id: str, body: dict[str, Any], request: Request):
    user = get_current_user(request)
    if user["role"] != "admin" and user["id"] != player_id:
        raise HTTPException(403, "Access denied")
    existing = _load_user(player_id)
    if not existing:
        raise HTTPException(404, f"Player not found: {player_id}")
    for k, v in body.items():
        if k not in ("id", "passwordHash"):
            existing[k] = v
    _save_user(existing)
    existing.pop("passwordHash", None)
    return existing


@app.post("/api/players")
async def create_player(body: dict[str, Any], request: Request):
    require_role_sync("admin")(request)
    pid = body.get("id", "").strip()
    if not pid:
        raise HTTPException(400, "id is required")
    if _load_user(pid):
        raise HTTPException(409, f"Player '{pid}' already exists")
    player = {
        "id": pid,
        "username": body.get("username", pid),
        "passwordHash": _hash_password(body.get("password", "password")),
        "role": body.get("role", "player"),
        "displayName": body.get("displayName", pid),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "stats": body.get("stats", {
            "totalMatches": 0, "wins": 0, "losses": 0, "winRate": 0,
            "favoriteCharacter": "", "favoriteCard": "",
            "totalDamageDealt": 0, "totalDamageTaken": 0, "highestDamageTurn": 0,
        }),
        "collection": body.get("collection", {"unlockedCharacters": [], "unlockedCards": []}),
        "avatarUrl": body.get("avatarUrl", ""),
    }
    _save_user(player)
    player.pop("passwordHash", None)
    return player


# ── Match endpoints ──

def _list_matches(player_id: str = "") -> list[dict]:
    MATCHES_DIR.mkdir(parents=True, exist_ok=True)
    matches = []
    for f in sorted(MATCHES_DIR.glob("*.json"), reverse=True):
        m = json.loads(f.read_text(encoding="utf-8"))
        if not player_id or any(p["playerId"] == player_id for p in m.get("players", [])):
            summary = {k: m[k] for k in ("id", "gameModeId", "players", "totalTurns", "startedAt", "endedAt", "winnerId") if k in m}
            matches.append(summary)
    return matches


@app.get("/api/matches")
async def list_matches(request: Request, playerId: str = ""):
    user = get_current_user(request)
    if user["role"] != "admin":
        playerId = user["id"]
    return _list_matches(playerId)


@app.get("/api/matches/{match_id}")
async def get_match(match_id: str, request: Request):
    user = get_current_user(request)
    path = MATCHES_DIR / f"{match_id}.json"
    if not path.exists():
        raise HTTPException(404, f"Match not found: {match_id}")
    match = json.loads(path.read_text(encoding="utf-8"))
    if user["role"] != "admin" and not any(p["playerId"] == user["id"] for p in match.get("players", [])):
        raise HTTPException(403, "Access denied")
    return match


@app.post("/api/matches")
async def create_match(body: dict[str, Any], request: Request):
    user = get_current_user(request)
    MATCHES_DIR.mkdir(parents=True, exist_ok=True)
    mid = body.get("id") or f"match_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}"
    body["id"] = mid
    body.setdefault("startedAt", datetime.now(timezone.utc).isoformat())
    body.setdefault("endedAt", datetime.now(timezone.utc).isoformat())
    (MATCHES_DIR / f"{mid}.json").write_text(
        json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return body


@app.delete("/api/matches/{match_id}")
async def delete_match(match_id: str, request: Request):
    user = get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    path = MATCHES_DIR / f"{match_id}.json"
    if not path.exists():
        raise HTTPException(404, f"Match not found: {match_id}")
    path.unlink()
    return {"status": "ok"}


# ── Generic table endpoints (must be AFTER specific routes) ──

@app.get("/api/{table}")
async def get_table(table: str, request: Request):
    # Game data tables are public-read for battle page; auth required for mutation
    if table not in TABLES:
        raise HTTPException(404, f"Unknown table: {table}")
    return _read_table(table)


@app.put("/api/{table}")
async def put_table(table: str, rows: list[dict[str, Any]], request: Request):
    get_current_user(request)
    if table not in TABLES:
        raise HTTPException(404, f"Unknown table: {table}")
    _write_table(table, rows)
    return {"status": "ok", "count": len(rows)}


# ── Dream narration proxy (DeepSeek, key kept server-side) ──

def _load_secret(name, default=""):
    """Read a secret from secrets.json (gitignored) or env var."""
    p = Path(__file__).parent / "secrets.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8")).get(name, default)
        except (json.JSONDecodeError, OSError):
            pass
    return os.environ.get(name, default)

DEEPSEEK_API_KEY = _load_secret("deepseek_key")

DREAM_SYSTEM_PROMPT = (
    "你是一位梦核（dreamcore）风格小说家。你会收到一段卡牌对战的事件流水，"
    "把它改写成第二人称、现在时的梦核小说片段，像一段正在发生的梦。\n"
    "硬性规则：\n"
    "1. 用「你」指代玩家本人；敌人用其名字（如「积水」「旧电视」「楼道」，或对手职业「执灯人」「拾梦人」）。\n"
    "2. 严禁出现任何游戏术语与数字：HP、护甲、格挡、法力、费用、 mana、卡牌、回合、buff、层数、伤害点数、抽牌、弃牌。\n"
    "3. 用梦核意象改写动作：攻击→伸手/靠近/触碰/压过来；格挡→缩起/盖住/退到墙边；"
    "治疗→回暖/想起一件小事；施加状态→光脚/发烧/长高/穿外套/肚子疼；受到伤害→凉意/钝痛/晃动/影子倾斜。\n"
    "4. 只写 1 到 2 句，不超过 70 个汉字，语流连贯，不要分点。\n"
    "5. 只输出小说正文本身。不要引号、不要书名号、不要前缀说明、不要「输出：」之类的字样。\n"
    "6. 卡牌名当作身边的寻常物件（泡泡糖、被子、滑滑梯、铅笔、镜子……），自然写进句子，不要解释它的功能。\n"
    "示例——输入「你打出 泡泡糖，对 积水 造成 6 伤害」→输出「你把那块甜得发苦的泡泡糖按进影子里，积水晃了一下，又向你近了一步。」"
)


@app.post("/api/dream-narrate")
async def dream_narrate(body: dict, request: Request):
    get_current_user(request)  # require login
    events = body.get("events", []) or []
    context = (body.get("context", "") or "").strip()
    if not events:
        return {"text": ""}
    events = events[-8:]
    lines = "\n".join(f"- {e}" for e in events)
    user_msg = (f"前文：{context}\n" if context else "") + f"本段事件：\n{lines}"
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": DREAM_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.95,
        "max_tokens": 140,
        "stream": False,
    }
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        },
        method="POST",
    )

    def _call():
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"].strip()
        except (urllib.error.URLError, KeyError, TimeoutError, ValueError):
            return ""

    text = await asyncio.to_thread(_call)
    return {"text": text}


# ── Static files ──
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
