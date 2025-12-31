// Theme initialization - runs before page render to prevent flash
(function() {
  var stored = localStorage.getItem('checklist-theme');
  var theme = stored === 'light' || stored === 'dark' ? stored : 'system';
  var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) document.documentElement.classList.add('dark');
})();
