// 只在生产环境注册 Service Worker
if (import.meta.env.PROD) {
  // 动态加载 sw-register.js 脚本
  const script = document.createElement('script');
  script.src = '/sw-register.js';
  script.async = true;
  document.head.appendChild(script);
}