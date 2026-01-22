// 设置页面脚本
document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const modelInput = document.getElementById('model');
  const enableAICheckbox = document.getElementById('enableAI');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // 加载已保存的设置
  chrome.storage.sync.get({
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    enableAI: true
  }, (items) => {
    apiUrlInput.value = items.apiUrl;
    apiKeyInput.value = items.apiKey;
    modelInput.value = items.model;
    enableAICheckbox.checked = items.enableAI;
  });

  // 保存设置
  saveBtn.addEventListener('click', () => {
    const settings = {
      apiUrl: apiUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim() || 'gpt-3.5-turbo',
      enableAI: enableAICheckbox.checked
    };

    chrome.storage.sync.set(settings, () => {
      status.textContent = '✓ 已保存';
      setTimeout(() => {
        status.textContent = '';
      }, 2000);
    });
  });
});
