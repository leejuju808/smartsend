// SmartSendAI Chrome Extension - Gmail Integration
console.log('SmartSendAI: Content script loaded');

(function () {
  const ORIGIN = "https://smartsend.ai";

  // 1) Link page: capture token
  if (location.origin === ORIGIN && location.pathname.startsWith("/extension/link")) {
    window.addEventListener("message", (e) => {
      if (e.origin !== ORIGIN) return;
      const msg = e.data || {};
      if (msg.type === "SMARTSENDAI_EXT_TOKEN" && typeof msg.token === "string") {
        chrome.storage.sync.set({ smartsend_token: msg.token }, () => {
          console.log("[SmartSendAI] Token saved");
        });
      }
    });
  }

  // 2) Gmail compose integration
  const tryInject = () => {
    const box = document.querySelector("div[role='textbox']");
    if (!box || document.getElementById("smartsend-btn")) return;

    const btn = document.createElement("button");
    btn.id = "smartsend-btn";
    btn.innerText = "✨ Smart Reply";
    btn.style.cssText = "margin:4px;padding:4px 8px;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;";
    btn.onclick = async () => {
      chrome.storage.sync.get(["smartsend_token"], async (res) => {
        const token = res.smartsend_token;
        if (!token) {
          alert("Please open SmartSendAI and click 'Connect Extension' first.");
          return;
        }
        
        const body = box.innerText;
        if (!body.trim()) {
          alert("Please type some text first to get AI suggestions.");
          return;
        }

        try {
          const r = await fetch("https://smartsend.ai/api/replies/assist", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ 
              lastMessage: body, 
              vars: { my_name: "You" } 
            })
          });
          
          const j = await r.json();
          if (r.ok && j?.suggestions?.length) {
            box.innerText += "\n\n" + j.suggestions[0].text;
          } else {
            alert("No suggestion available. Please try again.");
          }
        } catch (error) {
          console.error("SmartSendAI error:", error);
          alert("Failed to get AI suggestion. Please try again.");
        }
      });
    };
    
    // Find a good place to insert the button
    const toolbar = box.closest('[role="toolbar"]') || box.parentElement;
    if (toolbar) {
      toolbar.appendChild(btn);
    } else {
      box.parentElement.appendChild(btn);
    }
  };

  // Watch for DOM changes and inject button
  const obs = new MutationObserver(tryInject);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  
  // Also try periodically as backup
  setInterval(tryInject, 2000);
  
  // Initial injection attempt
  setTimeout(tryInject, 1000);
})(); 