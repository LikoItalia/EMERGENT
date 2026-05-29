"""Backend tests for Context app - auth, explain, library, billing."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://premium-subtitles.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

TEST_EMAIL = "test@context.app"
TEST_PASS = "test12345"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(client):
    # Try login with seeded user; if not exists register
    r = client.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASS})
    if r.status_code != 200:
        r = client.post(f"{API}/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASS, "name": "Test"})
    assert r.status_code == 200, f"auth setup failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_register_new_user(self, client):
        email = f"test_{uuid.uuid4().hex[:8]}@context.app"
        r = client.post(f"{API}/auth/register", json={"email": email, "password": "pw123456", "name": "Tester"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == email.lower()
        assert data["user"]["subscription_status"] == "trial"
        assert data["user"]["trial_ends_at"]
        assert data["user"]["language"] == "it"

    def test_register_duplicate_email_fails(self, client):
        r = client.post(f"{API}/auth/register", json={"email": TEST_EMAIL, "password": TEST_PASS, "name": "X"})
        assert r.status_code == 400

    def test_login_success(self, client):
        r = client.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASS})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["token_type"] == "bearer"
        assert d["user"]["email"] == TEST_EMAIL

    def test_login_wrong_password(self, client):
        r = client.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_returns_user(self, client, auth_headers):
        r = client.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == TEST_EMAIL
        assert "subscription_status" in d
        assert "trial_ends_at" in d

    def test_me_unauthorized(self, client):
        r = client.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_patch_language(self, client, auth_headers):
        r = client.patch(f"{API}/auth/language", headers=auth_headers, json={"language": "en"})
        assert r.status_code == 200
        # verify via /me
        me = client.get(f"{API}/auth/me", headers=auth_headers).json()
        assert me["language"] == "en"
        # restore
        client.patch(f"{API}/auth/language", headers=auth_headers, json={"language": "it"})


# ---------- Billing ----------
class TestBilling:
    def test_billing_status(self, client, auth_headers):
        r = client.get(f"{API}/billing/status", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "status" in d
        assert "trial_ends_at" in d
        assert "days_left" in d
        assert isinstance(d["days_left"], int)
        assert d["status"] in ("trial", "active", "expired")

    def test_billing_status_unauth(self, client):
        r = client.get(f"{API}/billing/status")
        assert r.status_code == 401

    def test_create_checkout_session(self, client, auth_headers):
        r = client.post(f"{API}/billing/create-checkout-session", headers=auth_headers)
        # Stripe test key 'sk_test_emergent' may be invalid → 500. Track both.
        if r.status_code == 200:
            d = r.json()
            assert "checkout_url" in d
            assert d["checkout_url"].startswith("https://")
            assert "session_id" in d
        else:
            pytest.fail(f"Stripe checkout failed: {r.status_code} {r.text[:300]}")


# ---------- Explain (Claude Haiku) ----------
class TestExplain:
    def test_explain_returns_structured(self, client, auth_headers):
        r = client.post(f"{API}/explain", headers=auth_headers,
                        json={"word": "EBITDA", "context": "L'EBITDA della società è cresciuto", "language": "it"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["word"] == "EBITDA"
        assert d["definition"]
        assert d["domain"] in ["Finance", "Tech", "Legal", "Marketing", "Strategy", "HR",
                                "Medicina", "Scienza", "Sport", "Arte", "Politica", "Generale"]
        assert d["what_to_say"]
        assert d["language"] == "it"

    def test_explain_unauth(self, client):
        r = client.post(f"{API}/explain", json={"word": "test"})
        assert r.status_code == 401


# ---------- Library ----------
class TestLibrary:
    def test_save_get_delete_word(self, client, auth_headers):
        word = f"TESTword_{uuid.uuid4().hex[:6]}"
        payload = {"word": word, "definition": "def", "domain": "Tech",
                   "what_to_say": "wts", "language": "it"}
        r = client.post(f"{API}/library/save", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        saved = r.json()
        assert saved["word"] == word.lower()
        assert saved["domain"] == "Tech"
        wid = saved["id"]

        # List
        r = client.get(f"{API}/library/words", headers=auth_headers)
        assert r.status_code == 200
        words = r.json()["words"]
        assert any(w["id"] == wid for w in words)

        # Save duplicate -> returns same id
        r2 = client.post(f"{API}/library/save", headers=auth_headers, json=payload)
        assert r2.status_code == 200
        assert r2.json()["id"] == wid

        # Delete by id
        r = client.delete(f"{API}/library/word/{wid}", headers=auth_headers)
        assert r.status_code == 200
        r = client.get(f"{API}/library/words", headers=auth_headers)
        assert not any(w["id"] == wid for w in r.json()["words"])

    def test_delete_by_domain(self, client, auth_headers):
        dom = "Sport"
        for i in range(2):
            client.post(f"{API}/library/save", headers=auth_headers,
                        json={"word": f"TEST_{uuid.uuid4().hex[:5]}_{i}", "definition": "d",
                              "domain": dom, "what_to_say": "w", "language": "it"})
        r = client.delete(f"{API}/library/domain/{dom}", headers=auth_headers)
        assert r.status_code == 200
        r = client.get(f"{API}/library/words", headers=auth_headers)
        assert not any(w["domain"] == dom for w in r.json()["words"])

    def test_library_unauth(self, client):
        r = client.get(f"{API}/library/words")
        assert r.status_code == 401


# ---------- Transcribe (existence only) ----------
class TestTranscribeExists:
    def test_transcribe_requires_auth(self, client):
        # Without auth header -> 401 expected
        r = requests.post(f"{API}/transcribe")
        assert r.status_code == 401
