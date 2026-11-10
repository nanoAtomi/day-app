// The apps' legal pages (blueprint: templates/frontend/legal). Loaded in <head>, not
// deferred, so the appearance is set before the first paint. Public pages: nothing
// here needs a login, and /theme-init.js (behind it) isn't used.
//
// - Appearance: the platform-wide choice (cookie nicasso-theme), else the device.
// - Language: the platform-wide choice (cookie nicasso-lang), else the browser's. The
//   page carries both; every element with a lang attribute in <body> shows only in its
//   language. There is no language switch - it lives in the account menu.
// - The bar: portal links point at portal.<this domain>; the avatar shows the initials
//   when signed in (the gateway's /oauth2/userinfo, same cookie) and links to the
//   profile, else a person that leads to the portal's sign-in.
(function () {
  var root = document.documentElement;
  var cookie = function (name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? match[1] : null;
  };
  var applyTheme = function () {
    var theme = cookie('nicasso-theme');
    root.classList.toggle('dark', theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  applyTheme();
  // The app's accent (<html data-accent="#ea580c">) - the CSP allows no inline styles.
  if (root.dataset.accent) root.style.setProperty('--accent', root.dataset.accent);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  var langCookie = cookie('nicasso-lang');
  var lang = langCookie === 'de' || langCookie === 'en' ? langCookie : (navigator.language || 'de').slice(0, 2) === 'en' ? 'en' : 'de';
  root.lang = lang;
  if (root.dataset['title' + (lang === 'en' ? 'En' : 'De')]) document.title = root.dataset['title' + (lang === 'en' ? 'En' : 'De')];

  var host = location.hostname;
  var local = host === 'localhost' || /^[\d.]+$/.test(host);
  var portal = local ? null : location.protocol + '//portal.' + host.split('.').slice(-2).join('.');

  var initials = function (name) {
    var parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
    return ((parts[0] ? parts[0][0] : '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('body [lang]').forEach(function (el) {
      el.hidden = el.lang !== lang;
    });
    document.querySelectorAll('[data-portal]').forEach(function (link) {
      if (portal) link.href = portal + (link.dataset.portal || '');
    });
    document.querySelectorAll('.footer a').forEach(function (link) {
      if (new URL(link.href).pathname === location.pathname) link.setAttribute('aria-current', 'page');
    });

    var avatar = document.querySelector('[data-avatar]');
    if (!avatar) return;
    fetch('/oauth2/userinfo', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (info) {
        if (!info) return;
        var name = info.preferredUsername || info.email || info.user;
        if (!name) return;
        avatar.textContent = initials(name);
        avatar.classList.add('signed-in');
        avatar.setAttribute('aria-label', avatar.dataset.profileLabel || name);
        if (portal) avatar.href = portal + '/profile';
      })
      .catch(function () {
        /* signed out or no gateway: the person icon stays */
      });
  });
})();
