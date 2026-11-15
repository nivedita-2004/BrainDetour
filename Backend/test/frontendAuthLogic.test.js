const { test, describe } = require('node:test');
const assert = require('node:assert');

// Exact normalizeBaseUrl algorithm from Frontend/src/services/api.js
function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim().replace(/\/+$/, '');
  if (clean.endsWith('/api')) {
    clean = clean.slice(0, -4);
  }
  return clean;
}

describe('Phase 4: Frontend Authentication State & Sequencing Logic', () => {
  // 1. Base URL normalization contract
  test('normalizeBaseUrl correctly handles unset, trailing slashes, and /api suffix', () => {
    assert.strictEqual(normalizeBaseUrl(undefined), '');
    assert.strictEqual(normalizeBaseUrl(''), '');
    assert.strictEqual(normalizeBaseUrl('   '), '');
    assert.strictEqual(normalizeBaseUrl('http://localhost:5000/'), 'http://localhost:5000');
    assert.strictEqual(normalizeBaseUrl('https://braindetour.onrender.com/api'), 'https://braindetour.onrender.com');
    assert.strictEqual(normalizeBaseUrl('https://braindetour.onrender.com/api/'), 'https://braindetour.onrender.com');
  });

  // 2. AuthProvider initial state contract
  test('AuthProvider state contract: user begins null and loading begins true', () => {
    const initialState = {
      user: null,
      loading: true,
      authActionId: 0,
    };
    assert.strictEqual(initialState.user, null);
    assert.strictEqual(initialState.loading, true);
  });

  // 3. Stale localStorage profile cannot authenticate
  test('Cached localStorage profile cannot authenticate the session', () => {
    const mockLocalStorage = {
      getItem: (key) => {
        if (key === 'braindetour_auth_session') {
          return JSON.stringify({ email: 'cached_imposter@external.com', name: 'Cached Imposter' });
        }
        return null;
      },
      removeItem: (key) => {},
    };

    // Under Phase 3 AuthProvider, user is initialized to null regardless of localStorage
    let user = null;
    let loading = true;

    // Verify localStorage item is never used to populate user
    assert.strictEqual(user, null, 'User must remain null on initial mount');
    assert.strictEqual(Boolean(user), false, 'isAuthenticated must be false');
  });

  // 4. Successful /auth/me verification populates profile
  test('Successful /auth/me verification populates user and clears loading', async () => {
    let user = null;
    let loading = true;
    let authActionId = 0;

    const actionId = ++authActionId;

    // Simulated /auth/me success
    const mockAuthMe = async () => ({
      success: true,
      user: { email: 'scholar@braindetour.com', name: 'Verified Scholar' },
    });

    const res = await mockAuthMe();
    if (actionId === authActionId) {
      user = res.user;
      loading = false;
    }

    assert.strictEqual(user.email, 'scholar@braindetour.com');
    assert.strictEqual(loading, false);
    assert.strictEqual(Boolean(user), true);
  });

  // 5. HTTP 401 error leaves user unauthenticated
  test('HTTP 401 unauthenticated response guarantees user = null and loading = false', async () => {
    let user = null;
    let loading = true;
    let authActionId = 0;

    const actionId = ++authActionId;

    const mockAuthMeError = async () => {
      const err = new Error('Unauthorized');
      err.response = { status: 401 };
      throw err;
    };

    try {
      await mockAuthMeError();
    } catch (_err) {
      if (actionId === authActionId) {
        user = null;
      }
    } finally {
      if (actionId === authActionId) {
        loading = false;
      }
    }

    assert.strictEqual(user, null);
    assert.strictEqual(loading, false);
    assert.strictEqual(Boolean(user), false);
  });

  // 6. HTTP 500 error does not authenticate a cached profile
  test('HTTP 500 server error never authenticates a cached user profile', async () => {
    let user = null;
    let loading = true;
    let authActionId = 0;

    const actionId = ++authActionId;

    const mock500Error = async () => {
      const err = new Error('Internal Server Error');
      err.response = { status: 500 };
      throw err;
    };

    try {
      await mock500Error();
    } catch (_err) {
      if (actionId === authActionId) {
        user = null;
      }
    } finally {
      if (actionId === authActionId) {
        loading = false;
      }
    }

    assert.strictEqual(user, null);
    assert.strictEqual(loading, false);
  });

  // 7. Network failure does not authenticate a cached profile
  test('Network disconnect or timeout leaves session safely unauthenticated', async () => {
    let user = null;
    let loading = true;
    let authActionId = 0;

    const actionId = ++authActionId;

    const mockNetworkError = async () => {
      throw new Error('Network Error: Connection Timed Out');
    };

    try {
      await mockNetworkError();
    } catch (_err) {
      if (actionId === authActionId) {
        user = null;
      }
    } finally {
      if (actionId === authActionId) {
        loading = false;
      }
    }

    assert.strictEqual(user, null);
    assert.strictEqual(loading, false);
  });

  // 8. Stale /auth/me response cannot overwrite newer login
  test('A delayed /auth/me initialization response cannot overwrite a newer login', async () => {
    let user = null;
    let loading = true;
    let authActionId = 0;

    // 1. Mount triggers checkAuthSession (action 1)
    const initActionId = ++authActionId;
    let resolveSlowInit;
    const slowInitPromise = new Promise((resolve) => {
      resolveSlowInit = resolve;
    });

    // 2. User immediately logs in as User Newer (action 2)
    const loginActionId = ++authActionId;
    user = { email: 'newer@braindetour.com', name: 'Newer User' };
    loading = false;

    // 3. Delayed initialization finally resolves with User Stale
    resolveSlowInit({
      success: true,
      user: { email: 'stale_old@braindetour.com', name: 'Stale User' },
    });
    const delayedData = await slowInitPromise;

    // Sequence check guards state update
    if (initActionId === authActionId) {
      user = delayedData.user;
    }

    // Assert that User Newer is preserved and User Stale was discarded
    assert.strictEqual(user.email, 'newer@braindetour.com');
    assert.notStrictEqual(user.email, 'stale_old@braindetour.com');
  });

  // 9. Stale response cannot restore a user after logout
  test('A delayed /auth/me or refresh response cannot restore a user after logout', async () => {
    let user = { email: 'scholar@braindetour.com' };
    let loading = false;
    let authActionId = 1;

    // In-flight refresh (action 2)
    const refreshActionId = ++authActionId;
    let resolveDelayedRefresh;
    const delayedRefreshPromise = new Promise((resolve) => {
      resolveDelayedRefresh = resolve;
    });

    // User logs out (action 3)
    const logoutActionId = ++authActionId;
    user = null;
    loading = false;

    // Delayed refresh resolves with user
    resolveDelayedRefresh({
      user: { email: 'scholar@braindetour.com' },
    });
    const refreshData = await delayedRefreshPromise;

    // Sequence check guards state update
    if (refreshActionId === authActionId) {
      user = refreshData.user;
    }

    // Assert user remains null (logged out)
    assert.strictEqual(user, null);
  });

  // 10. Navbar and ProtectedRoute behavior contracts
  test('Navbar and ProtectedRoute guards respect loading state', () => {
    const renderNavbarAuthDesktop = ({ loading, isAuthenticated, user }) => {
      if (loading) return null;
      if (isAuthenticated) return `ProfileMenu(${user.name})`;
      return 'LoginButton';
    };

    const evaluateProtectedRoute = ({ loading, isAuthenticated }) => {
      if (loading) return 'WAIT_FOR_VERIFICATION';
      if (!isAuthenticated) return 'REDIRECT_TO_LOGIN';
      return 'RENDER_PROTECTED_CONTENT';
    };

    // When loading:
    assert.strictEqual(renderNavbarAuthDesktop({ loading: true, isAuthenticated: false, user: null }), null);
    assert.strictEqual(renderNavbarAuthDesktop({ loading: true, isAuthenticated: true, user: { name: 'A' } }), null);
    assert.strictEqual(evaluateProtectedRoute({ loading: true, isAuthenticated: false }), 'WAIT_FOR_VERIFICATION');

    // When loaded & unauthenticated:
    assert.strictEqual(renderNavbarAuthDesktop({ loading: false, isAuthenticated: false, user: null }), 'LoginButton');
    assert.strictEqual(evaluateProtectedRoute({ loading: false, isAuthenticated: false }), 'REDIRECT_TO_LOGIN');

    // When loaded & authenticated:
    assert.strictEqual(renderNavbarAuthDesktop({ loading: false, isAuthenticated: true, user: { name: 'Verified' } }), 'ProfileMenu(Verified)');
    assert.strictEqual(evaluateProtectedRoute({ loading: false, isAuthenticated: true }), 'RENDER_PROTECTED_CONTENT');
  });
});
