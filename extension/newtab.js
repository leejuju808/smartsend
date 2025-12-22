const SMARTSEND_BASE = "https://smartsend.ai";
const TARGET_PATH = "/dashboard/daily";

function go() {
  // Use replace() so the new tab history doesn't keep the stub page.
  window.location.replace(`${SMARTSEND_BASE}${TARGET_PATH}`);
}

function showConnect() {
  const card = document.getElementById("card");
  if (card) card.style.display = "block";

  const connectBtn = document.getElementById("connect");
  const openBtn = document.getElementById("open");

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      window.location.href = `${SMARTSEND_BASE}/extension/link`;
    });
  }

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      window.location.href = `${SMARTSEND_BASE}${TARGET_PATH}`;
    });
  }
}

try {
  chrome.storage.sync.get(["smartsend_token"], (result) => {
    if (result && result.smartsend_token) {
      go();
    } else {
      showConnect();
    }
  });
} catch {
  // If chrome.* isn't available (e.g. opened as a file), just show the connect UI.
  showConnect();
}

