// Service Worker 缓存配置
const CACHE_NAME = 'srt-translator-cache-v1';
const RUNTIME_CACHE = 'srt-translator-runtime-v1';

// 需要预缓存的核心资源
const PRECACHE_URLS = [
  '/',
  '/index.html'
];

// 增强响应头，开启跨源隔离（支持 SharedArrayBuffer）
function addIsolationHeaders(response) {
  if (!response || response.status === 0) {
    return response;
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
  newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
  newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// 安装事件 - 预缓存核心资源
self.addEventListener('install', event => {
  console.log('[SW] 安装中...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 预缓存核心资源');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] 安装完成，跳过等待');
        return self.skipWaiting();
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  console.log('[SW] 激活中...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // 删除旧版本缓存
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] 删除旧缓存:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] 激活完成，接管所有页面');
        return self.clients.claim();
      })
  );
});

// 拦截网络请求
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源请求
  if (url.origin !== location.origin) {
    return;
  }

  // 根据资源类型选择缓存策略
  // 全部使用缓存优先策略，确保快速加载
  event.respondWith(cacheFirst(request));
});

// 判断是否为HTML请求
function isHTMLRequest(request) {
  return request.method === 'GET' &&
         (request.headers.get('accept') || '').includes('text/html');
}

// 缓存优先策略（Stale While Revalidate）
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    // 先查缓存，立即返回
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] 缓存命中:', request.url);

      // 后台更新缓存（不阻塞响应）
      fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
          console.log('[SW] 后台更新缓存:', request.url);
        }
      }).catch(() => {
        // 后台更新失败，忽略
      });

      return addIsolationHeaders(cachedResponse);
    }

    // 缓存未命中，请求网络
    console.log('[SW] 网络请求:', request.url);
    const networkResponse = await fetch(request);

    // 缓存成功的响应
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      console.log('[SW] 已缓存:', request.url);
    }

    return addIsolationHeaders(networkResponse);
  } catch (error) {
    console.error('[SW] 请求失败:', request.url, error);

    // 网络失败时尝试返回缓存
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] 离线模式，返回缓存:', request.url);
      return addIsolationHeaders(cachedResponse);
    }

    // 如果是HTML请求且无缓存，返回离线页面
    if (isHTMLRequest(request)) {
      const offlineResponse = await caches.match('/');
      if (offlineResponse) {
        return addIsolationHeaders(offlineResponse);
      }
    }

    throw error;
  }
}

// 监听消息事件（用于手动更新缓存等操作）
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] 收到跳过等待消息');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    console.log('[SW] 收到缓存URL请求');
    const urls = event.data.payload;
    caches.open(RUNTIME_CACHE)
      .then(cache => cache.addAll(urls))
      .then(() => {
        console.log('[SW] 批量缓存完成');
        event.ports[0].postMessage({ success: true });
      })
      .catch(error => {
        console.error('[SW] 批量缓存失败:', error);
        event.ports[0].postMessage({ success: false, error: error.message });
      });
  }
});

console.log('[SW] Service Worker 已加载');