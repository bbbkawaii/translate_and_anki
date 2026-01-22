// 划词翻译插件 - 后台服务
// 在 Manifest V3 中，这是一个 Service Worker

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('划词翻译插件已安装');
});

// 可以在这里添加更多后台功能
// 例如：右键菜单、快捷键等
