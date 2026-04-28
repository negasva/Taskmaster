const params = new URLSearchParams(window.location.search);
const domain = params.get('domain') || 'este sitio';
const category = params.get('category') || 'desconocida';

document.getElementById('domain-text').textContent = domain;
document.getElementById('category-text').textContent = category.replace('_', ' ');

const motivations = [
  "Mantente enfocado, tus metas te esperan.",
  "La disciplina es el puente entre tus metas y tus logros.",
  "Tu productividad de hoy define tu éxito de mañana.",
  "Pequeños progresos cada día suman grandes resultados.",
  "Concéntrate en ser productivo, no en estar ocupado.",
  "El éxito es la suma de pequeños esfuerzos repetidos día tras día."
];

const randomMotivation = motivations[Math.floor(Math.random() * motivations.length)];
document.getElementById('motivation-text').textContent = randomMotivation;

function updateTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('time-text').textContent = `Bloqueado a las ${timeStr} — Horario de enfoque`;
}

updateTime();
setInterval(updateTime, 60000);

document.getElementById('close-tab-btn').addEventListener('click', () => {
  window.close();
});
