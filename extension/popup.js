document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');

  // Check connection status
  function checkStatus() {
    chrome.storage.sync.get(['smartsend_token'], function(result) {
      if (result.smartsend_token) {
        statusDiv.textContent = '✅ Extension connected';
        statusDiv.className = 'status connected';
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'block';
      } else {
        statusDiv.textContent = '❌ Extension not connected';
        statusDiv.className = 'status disconnected';
        connectBtn.style.display = 'block';
        disconnectBtn.style.display = 'none';
      }
    });
  }

  // Connect button handler
  connectBtn.addEventListener('click', function() {
    chrome.tabs.create({
      url: 'https://smartsend.ai/extension/link'
    });
  });

  // Disconnect button handler
  disconnectBtn.addEventListener('click', function() {
    if (confirm('Are you sure you want to disconnect the extension?')) {
      chrome.storage.sync.remove(['smartsend_token'], function() {
        checkStatus();
      });
    }
  });

  // Check status on load
  checkStatus();

  // Listen for storage changes
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync' && changes.smartsend_token) {
      checkStatus();
    }
  });
}); 