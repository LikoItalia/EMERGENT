from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import json
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Annotated
from datetime import datetime, timedelta, timezone
import jwt
from passlib.context import CryptContext
from openai import OpenAI
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# === Config ===
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
JWT_SECRET = os.environ['JWT_SECRET_KEY']
JWT_ALG = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRES_MIN = int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES_MINUTES', '43200'))
STRIPE_API_KEY = os.environ['STRIPE_API_KEY']

TRIAL_DAYS = 7

# === DB ===
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# === Security ===
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# === OpenAI Whisper (via Emergent Universal Key) ===
openai_client = OpenAI(
    api_key=EMERGENT_LLM_KEY,
    base_url="https://integrations.emergentagent.com/llm"
)

# === FastAPI App ===
app = FastAPI(title="Context API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============ MODELS ============
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    subscription_status: str
    trial_ends_at: str
    language: str = "it"

class TokenResp(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic

class ExplainReq(BaseModel):
    word: str
    context: Optional[str] = ""
    language: str = "it"

class SavedWord(BaseModel):
    id: str
    word: str
    definition: str
    domain: str
    what_to_say: str
    language: str
    created_at: str

class SaveWordReq(BaseModel):
    word: str
    definition: str
    domain: str
    what_to_say: str
    language: str = "it"

class UpdateLangReq(BaseModel):
    language: str


# ============ AUTH HELPERS ============
def hash_pw(pw: str) -> str:
    return pwd_ctx.hash(pw)

def verify_pw(pw: str, h: str) -> bool:
    try:
        return pwd_ctx.verify(pw, h)
    except Exception:
        return False

def create_token(user_id: str, email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRES_MIN)
    return jwt.encode({"sub": user_id, "email": email, "exp": exp}, JWT_SECRET, algorithm=JWT_ALG)

def user_to_public(u: dict) -> UserPublic:
    trial_ends = u.get("trial_ends_at")
    if isinstance(trial_ends, datetime):
        trial_ends_str = trial_ends.isoformat()
    else:
        trial_ends_str = str(trial_ends) if trial_ends else ""
    return UserPublic(
        id=u["id"],
        email=u["email"],
        name=u.get("name", ""),
        subscription_status=u.get("subscription_status", "trial"),
        trial_ends_at=trial_ends_str,
        language=u.get("language", "it"),
    )

async def get_current_user(token: Annotated[str, Depends(oauth2)]) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


# ============ AUTH ROUTES ============
@api.post("/auth/register", response_model=TokenResp)
async def register(body: RegisterReq):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email già registrata")
    now = datetime.now(timezone.utc)
    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "email": email,
        "name": body.name,
        "password_hash": hash_pw(body.password),
        "subscription_status": "trial",
        "trial_ends_at": now + timedelta(days=TRIAL_DAYS),
        "language": "it",
        "created_at": now,
    }
    await db.users.insert_one(user)
    token = create_token(uid, email)
    return TokenResp(access_token=token, user=user_to_public(user))

@api.post("/auth/login", response_model=TokenResp)
async def login(body: LoginReq):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Email o password non valida")
    token = create_token(user["id"], email)
    return TokenResp(access_token=token, user=user_to_public(user))

@api.get("/auth/me", response_model=UserPublic)
async def me(user=Depends(get_current_user)):
    return user_to_public(user)

@api.patch("/auth/language")
async def update_language(body: UpdateLangReq, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"language": body.language}})
    return {"ok": True}


# ============ WHISPER TRANSCRIPTION ============
@api.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = "it", user=Depends(get_current_user)):
    try:
        audio_bytes = await file.read()
        if len(audio_bytes) < 100:
            return {"text": ""}
        fname = file.filename or "audio.m4a"
        # Ensure file extension is recognized
        if not any(fname.endswith(ext) for ext in ['.m4a', '.mp3', '.wav', '.webm', '.mp4', '.ogg']):
            fname = fname + ".m4a"
        bio = io.BytesIO(audio_bytes)
        bio.name = fname
        resp = openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=bio,
            language=language if language in ['it', 'en', 'es', 'fr', 'de'] else 'it',
            response_format="json",
        )
        text = getattr(resp, "text", "") if not isinstance(resp, dict) else resp.get("text", "")
        return {"text": text}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(500, f"Errore trascrizione: {str(e)[:200]}")


# ============ TERM EXPLANATION (Claude Haiku) ============
DOMAINS = ["Finance", "Tech", "Legal", "Marketing", "Strategy", "HR", "Medicina", "Scienza", "Sport", "Arte", "Politica", "Generale"]

LANG_LABELS = {
    "it": "italiano", "en": "English", "es": "español",
    "fr": "français", "de": "Deutsch"
}

@api.post("/explain")
async def explain_word(body: ExplainReq, user=Depends(get_current_user)):
    lang_name = LANG_LABELS.get(body.language, "italiano")
    sys_msg = (
        f"Sei un assistente esperto che spiega termini in {lang_name}. "
        f"Quando ricevi un termine, rispondi SOLO con un JSON valido con queste chiavi: "
        f'"definition" (definizione breve e chiara in {lang_name}, max 2 frasi), '
        f'"domain" (uno tra: {", ".join(DOMAINS)}), '
        f'"what_to_say" (una frase pronta da usare in conversazione in {lang_name}, max 1 frase). '
        f"NON aggiungere markdown, NON aggiungere testo prima o dopo il JSON. Solo JSON puro."
    )
    user_text = f'Termine: "{body.word}"'
    if body.context:
        user_text += f'\nContesto: "{body.context[:200]}"'

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"explain-{user['id']}-{uuid.uuid4().hex[:8]}",
            system_message=sys_msg,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        reply = await chat.send_message(UserMessage(text=user_text))
        text = reply.strip()
        # Strip code fences if any
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()
        data = json.loads(text)
        domain = data.get("domain", "Generale")
        if domain not in DOMAINS:
            domain = "Generale"
        return {
            "word": body.word,
            "definition": data.get("definition", ""),
            "domain": domain,
            "what_to_say": data.get("what_to_say", ""),
            "language": body.language,
        }
    except Exception as e:
        logger.error(f"Explain error: {e}")
        raise HTTPException(500, f"Errore spiegazione: {str(e)[:200]}")


# ============ LIBRARY ============
@api.post("/library/save", response_model=SavedWord)
async def save_word(body: SaveWordReq, user=Depends(get_current_user)):
    # Avoid duplicates of same word for user
    existing = await db.saved_words.find_one({"user_id": user["id"], "word": body.word.lower()}, {"_id": 0})
    if existing:
        return SavedWord(
            id=existing["id"], word=existing["word"], definition=existing["definition"],
            domain=existing["domain"], what_to_say=existing["what_to_say"],
            language=existing.get("language", "it"), created_at=existing["created_at"]
        )
    now = datetime.now(timezone.utc).isoformat()
    wid = str(uuid.uuid4())
    doc = {
        "id": wid,
        "user_id": user["id"],
        "word": body.word.lower(),
        "definition": body.definition,
        "domain": body.domain,
        "what_to_say": body.what_to_say,
        "language": body.language,
        "created_at": now,
    }
    await db.saved_words.insert_one(doc)
    return SavedWord(id=wid, word=doc["word"], definition=doc["definition"],
                     domain=doc["domain"], what_to_say=doc["what_to_say"],
                     language=doc["language"], created_at=now)

@api.get("/library/words")
async def get_library(user=Depends(get_current_user)):
    cursor = db.saved_words.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1)
    words = await cursor.to_list(length=1000)
    return {"words": words}

@api.delete("/library/word/{word_id}")
async def delete_word(word_id: str, user=Depends(get_current_user)):
    await db.saved_words.delete_one({"id": word_id, "user_id": user["id"]})
    return {"ok": True}

@api.delete("/library/domain/{domain}")
async def delete_domain(domain: str, user=Depends(get_current_user)):
    await db.saved_words.delete_many({"user_id": user["id"], "domain": domain})
    return {"ok": True}


# ============ STRIPE SUBSCRIPTION ============
@api.post("/billing/create-checkout-session")
async def create_checkout(request: Request, user=Depends(get_current_user)):
    try:
        origin = request.headers.get("origin") or "https://premium-subtitles.preview.emergentagent.com"
        webhook_url = f"{origin.rstrip('/')}/api/billing/webhook"
        checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        req = CheckoutSessionRequest(
            amount=9.00,
            currency="eur",
            success_url=f"{origin.rstrip('/')}/?stripe=success",
            cancel_url=f"{origin.rstrip('/')}/?stripe=cancel",
            metadata={"user_id": user["id"], "plan": "context_pro_monthly"},
        )
        session = await checkout.create_checkout_session(req)
        # Persist transaction
        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "user_id": user["id"],
            "amount": 9.00,
            "currency": "eur",
            "payment_status": "pending",
            "status": "initiated",
            "metadata": {"plan": "context_pro_monthly"},
            "created_at": datetime.now(timezone.utc),
        })
        return {"checkout_url": session.url, "session_id": session.session_id}
    except Exception as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(500, f"Errore Stripe: {str(e)[:200]}")

@api.get("/billing/checkout-status/{session_id}")
async def checkout_status(session_id: str, user=Depends(get_current_user)):
    try:
        checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
        s = await checkout.get_checkout_status(session_id)
        tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["id"]}, {"_id": 0})
        if tx and tx.get("payment_status") != s.payment_status:
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"payment_status": s.payment_status, "status": s.status}}
            )
            if s.payment_status == "paid":
                await db.users.update_one({"id": user["id"]}, {"$set": {"subscription_status": "active"}})
        return {"payment_status": s.payment_status, "status": s.status, "amount_total": s.amount_total}
    except Exception as e:
        logger.error(f"Checkout status error: {e}")
        raise HTTPException(500, f"Errore: {str(e)[:200]}")

@api.post("/billing/webhook")
async def stripe_webhook(request: Request):
    try:
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
        ev = await checkout.handle_webhook(body, sig)
        if ev.event_type in ("checkout.session.completed", "payment_intent.succeeded") and ev.payment_status == "paid":
            tx = await db.payment_transactions.find_one({"session_id": ev.session_id})
            if tx:
                await db.payment_transactions.update_one(
                    {"session_id": ev.session_id},
                    {"$set": {"payment_status": "paid", "status": "completed"}}
                )
                await db.users.update_one({"id": tx["user_id"]}, {"$set": {"subscription_status": "active"}})
        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": False, "error": str(e)[:200]}

@api.get("/billing/status")
async def billing_status(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    trial_ends = user.get("trial_ends_at")
    if isinstance(trial_ends, str):
        try:
            trial_ends = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
        except Exception:
            trial_ends = now
    if isinstance(trial_ends, datetime) and trial_ends.tzinfo is None:
        trial_ends = trial_ends.replace(tzinfo=timezone.utc)
    status_val = user.get("subscription_status", "trial")
    if status_val == "trial" and trial_ends and trial_ends < now:
        status_val = "expired"
        await db.users.update_one({"id": user["id"]}, {"$set": {"subscription_status": "expired"}})
    days_left = max(0, (trial_ends - now).days) if trial_ends else 0
    return {
        "status": status_val,
        "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
        "days_left": days_left,
    }


@api.get("/")
async def root():
    return {"app": "Context", "version": "1.0"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
