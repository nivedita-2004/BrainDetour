import axios from 'axios';

const rawBaseUrl =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_API_BASE_URL
    : undefined;

export function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim().replace(/\/+$/, '');
  if (clean.endsWith('/api')) {
    clean = clean.slice(0, -4);
  }
  return clean;
}

export const API_BASE_URL = normalizeBaseUrl(rawBaseUrl);

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Request Interceptor: URL normalization and duplicate /api prevention
api.interceptors.request.use(
  (config) => {
    if (config.url && typeof config.url === 'string') {
      // Only process relative paths (not external https?:// URLs)
      if (!/^https?:\/\//i.test(config.url)) {
        let path = config.url.startsWith('/') ? config.url : `/${config.url}`;
        // Prevent accidental duplicate /api/api
        path = path.replace(/^\/api\/api(\/|$)/, '/api$1');
        // Ensure path starts with /api
        if (!path.startsWith('/api/') && path !== '/api') {
          path = `/api${path}`;
        }
        config.url = path;
      }
    }

    // When sending FormData, let Axios and browser compute correct boundary headers
    if (config.data instanceof FormData && config.headers) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);


let activeRefreshPromise = null;


export async function refreshAccessToken() {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  const refreshUrl = `${API_BASE_URL}/api/auth/refresh`;

  activeRefreshPromise = axios
    .post(
      refreshUrl,
      {},
      {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
      }
    )
    .then((res) => {
      activeRefreshPromise = null;
      return res.data;
    })
    .catch((err) => {
      activeRefreshPromise = null;
      throw err;
    });

  return activeRefreshPromise;
}


api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/signup') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/verify-reset-otp') ||
      url.includes('/auth/reset-password');
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        await refreshAccessToken();
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;