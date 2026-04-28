let currentConfig = null;

// Cargar configuración
function loadConfig() {
  chrome.runtime.sendMessage({ type: "GET_CONFIG" }, (response) => {
    currentConfig = response.config;
    renderUI();
  });
}

function renderUI() {
  if (!currentConfig) return;

  document.getElementById('master-toggle').checked = currentConfig.enabled;
  document.getElementById('start-hour').value = currentConfig.startHour;
  document.getElementById('end-hour').value = currentConfig.endHour;

  // Días
  const dayBtns = document.querySelectorAll('#days-selector button');
  dayBtns.forEach(btn => {
    const day = parseInt(btn.dataset.day);
    if (currentConfig.days.includes(day)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Categorías
  const list = document.getElementById('categories-list');
  list.innerHTML = '';
  
  let totalDomains = 0;

  for (const catKey in currentConfig.categories) {
    const category = currentConfig.categories[catKey];
    totalDomains += category.domains.length;

    const item = document.createElement('div');
    item.className = 'category-item';
    
    const label = catKey.replace('_', ' ');
    
    item.innerHTML = `
      <div class="category-row">
        <div class="category-info">
          <label class="switch">
            <input type="checkbox" class="cat-toggle" data-cat="${catKey}" ${category.enabled ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
          <span>${label}</span>
        </div>
        <div class="domain-count">${category.domains.length} sitios</div>
      </div>
      <div class="domains-list">
        ${category.domains.map((d, i) => `
          <div class="domain-tag">
            ${d}
            <button class="remove-domain" data-cat="${catKey}" data-idx="${i}">✕</button>
          </div>
        `).join('')}
      </div>
    `;

    // Click en la fila para expandir (pero no en el toggle)
    item.querySelector('.category-row').addEventListener('click', (e) => {
      if (!e.target.closest('.switch')) {
        item.classList.toggle('open');
      }
    });

    // Toggle de categoría
    item.querySelector('.cat-toggle').addEventListener('change', (e) => {
      currentConfig.categories[catKey].enabled = e.target.checked;
    });

    // Eliminar dominio
    item.querySelectorAll('.remove-domain').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = btn.dataset.cat;
        const idx = parseInt(btn.dataset.idx);
        currentConfig.categories[cat].domains.splice(idx, 1);
        renderUI();
      });
    });

    list.appendChild(item);
  }

  document.getElementById('block-count').textContent = totalDomains;
}

// Event Listeners
document.getElementById('days-selector').addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    const day = parseInt(e.target.dataset.day);
    if (currentConfig.days.includes(day)) {
      currentConfig.days = currentConfig.days.filter(d => d !== day);
    } else {
      currentConfig.days.push(day);
    }
    renderUI();
  }
});

document.getElementById('add-site-btn').addEventListener('click', () => {
  const domain = document.getElementById('new-site-domain').value.trim();
  const cat = document.getElementById('new-site-category').value;
  
  if (domain) {
    currentConfig.categories[cat].domains.push(domain);
    document.getElementById('new-site-domain').value = '';
    renderUI();
  }
});

document.getElementById('save-btn').addEventListener('click', () => {
  currentConfig.enabled = document.getElementById('master-toggle').checked;
  currentConfig.startHour = parseInt(document.getElementById('start-hour').value);
  currentConfig.endHour = parseInt(document.getElementById('end-hour').value);

  chrome.runtime.sendMessage({ type: "UPDATE_CONFIG", config: currentConfig }, (response) => {
    if (response.success) {
      const btn = document.getElementById('save-btn');
      btn.textContent = '¡Guardado!';
      btn.style.background = '#34c759';
      setTimeout(() => {
        btn.textContent = 'Guardar Cambios';
        btn.style.background = '#fff';
      }, 2000);
    }
  });
});

// Chequear status de Taskmaster
async function checkStatus() {
  try {
    const response = await fetch("http://localhost:47700/api/status");
    const data = await response.json();
    if (data.running) {
      document.getElementById('status-bar').classList.add('online');
      document.getElementById('status-text').textContent = 'Conectado a Taskmaster';
    }
  } catch (e) {
    document.getElementById('status-bar').classList.remove('online');
    document.getElementById('status-text').textContent = 'Taskmaster no detectado (Modo Offline)';
  }
}

loadConfig();
checkStatus();
setInterval(checkStatus, 5000);
