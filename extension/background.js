const DEFAULT_CATEGORIES = {
  redes_sociales: {
    enabled: true,
    domains: ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "reddit.com", "pinterest.com", "snapchat.com", "tumblr.com", "linkedin.com/feed"]
  },
  compras: {
    enabled: true,
    domains: ["amazon.com", "mercadolibre.com", "aliexpress.com", "shein.com", "temu.com", "ebay.com", "wish.com", "walmart.com", "target.com", "bestbuy.com", "etsy.com", "asos.com", "zara.com"]
  },
  entretenimiento: {
    enabled: true,
    domains: ["youtube.com", "twitch.tv", "netflix.com", "hulu.com", "disneyplus.com", "hbomax.com", "primevideo.com", "crunchyroll.com", "spotify.com", "soundcloud.com", "9gag.com", "imgur.com"]
  },
  noticias: {
    enabled: true,
    domains: ["buzzfeed.com", "digg.com", "cnn.com", "bbc.com", "nytimes.com"]
  },
  juegos: {
    enabled: true,
    domains: ["miniclip.com", "poki.com", "crazygames.com", "y8.com", "discord.com", "steamcommunity.com"]
  }
};

const DEFAULT_CONFIG = {
  enabled: true,
  startHour: 8,
  endHour: 17,
  days: [1, 2, 3, 4, 5], // Lunes a Viernes
  categories: DEFAULT_CATEGORIES
};

// Inicializar storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["config"], (result) => {
    if (!result.config) {
      chrome.storage.local.set({ config: DEFAULT_CONFIG });
    }
  });
});

// Sincronización con Taskmaster (Electron)
async function syncWithTaskmaster() {
  try {
    const statusResponse = await fetch("http://localhost:47700/api/status");
    const status = await statusResponse.json();

    if (status.running) {
      // También podrías traer configuraciones de API aquí si fuera necesario
      const sitesResponse = await fetch("http://localhost:47700/api/config");
      const configFromServer = await sitesResponse.json();
      if (configFromServer) {
        chrome.storage.local.set({ config: configFromServer });
      }
    }
  } catch (e) {
    console.log("Taskmaster no detectado, usando configuración local.");
  }
}

// Sincronizar cada 30 segundos
setInterval(syncWithTaskmaster, 30000);
syncWithTaskmaster();

// Lógica de bloqueo
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // Solo pestañas principales

  chrome.storage.local.get(["config"], (result) => {
    const config = result.config || DEFAULT_CONFIG;
    if (!config.enabled) return;

    // Verificar horario
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    if (!config.days.includes(currentDay)) return;
    if (currentHour < config.startHour || currentHour >= config.endHour) return;

    const url = new URL(details.url);
    const domain = url.hostname.replace("www.", "");

    // Buscar en categorías
    for (const catKey in config.categories) {
      const category = config.categories[catKey];
      if (category.enabled) {
        if (category.domains.some(d => domain.includes(d))) {
          const blockedUrl = chrome.runtime.getURL(`blocked.html?domain=${domain}&category=${catKey}`);
          chrome.tabs.update(details.tabId, { url: blockedUrl });
          return;
        }
      }
    }
  });
});

// Escuchar mensajes del popup o de la página de bloqueo
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_CONFIG") {
    chrome.storage.local.set({ config: message.config }, () => {
      // Intentar enviar al servidor de Electron si está activo
      fetch("http://localhost:47700/api/blocked-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.config)
      }).catch(() => { });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_CONFIG") {
    chrome.storage.local.get(["config"], (result) => {
      sendResponse({ config: result.config || DEFAULT_CONFIG });
    });
    return true;
  }
});
