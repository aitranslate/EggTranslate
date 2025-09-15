// Service Worker 注册脚本
(function() {
  'use strict';
  
  // 检查浏览器支持
  if (!('serviceWorker' in navigator)) {
    console.log('浏览器不支持 Service Worker');
    return;
  }
  
  // 页面加载完成后注册
  window.addEventListener('load', function() {
    registerServiceWorker();
  });
  
  async function registerServiceWorker() {
    try {
      console.log('[SW注册] 开始注册 Service Worker...');
      
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './'
      });
      
      console.log('[SW注册] Service Worker 注册成功:', registration.scope);
      
      // 监听更新
      registration.addEventListener('updatefound', () => {
        console.log('[SW注册] 发现新版本');
        const newWorker = registration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW注册] 新版本已安装，等待激活');
            showUpdateNotification(registration);
          }
        });
      });
      
      // 监听控制器变化
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW注册] Service Worker 已更新，刷新页面');
        window.location.reload();
      });
      
      // 检查是否有等待中的 Service Worker
      if (registration.waiting) {
        showUpdateNotification(registration);
      }
      
    } catch (error) {
      console.error('[SW注册] Service Worker 注册失败:', error);
    }
  }
  
  // 显示更新通知
  function showUpdateNotification(registration) {
    // 创建更新提示
    const notification = document.createElement('div');
    notification.id = 'sw-update-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="margin-bottom: 8px; font-weight: 500;">
          🚀 发现新版本
        </div>
        <div style="margin-bottom: 12px; opacity: 0.9;">
          点击更新以获得最新功能
        </div>
        <div>
          <button id="sw-update-btn" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
            font-size: 12px;
          ">立即更新</button>
          <button id="sw-dismiss-btn" style="
            background: transparent;
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">稍后</button>
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;
    
    document.body.appendChild(notification);
    
    // 绑定事件
    document.getElementById('sw-update-btn').addEventListener('click', () => {
      console.log('[SW注册] 用户确认更新');
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      notification.remove();
    });
    
    document.getElementById('sw-dismiss-btn').addEventListener('click', () => {
      console.log('[SW注册] 用户取消更新');
      notification.remove();
    });
    
    // 10秒后自动隐藏
    setTimeout(() => {
      if (document.getElementById('sw-update-notification')) {
        notification.remove();
      }
    }, 10000);
  }
  
  // 提供全局方法用于手动缓存资源
  window.cacheResources = async function(urls) {
    if (!navigator.serviceWorker.controller) {
      console.warn('Service Worker 未激活，无法缓存资源');
      return false;
    }
    
    try {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data.success);
        };
        
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_URLS',
          payload: urls
        }, [messageChannel.port2]);
      });
    } catch (error) {
      console.error('缓存资源失败:', error);
      return false;
    }
  };
  
  console.log('[SW注册] Service Worker 注册脚本已加载');
})();