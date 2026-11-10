// Sets the platform-wide appearance (cookie "nicasso-theme", see prefs.ts) before the
// first paint, so a dark-mode user never sees a white flash. A plain same-origin file,
// not an inline script: the CSP allows only 'self'. Loaded blocking from index.html.
(function () {
  try {
    var match = document.cookie.match(/(?:^|; )nicasso-theme=(light|dark)/);
    var dark = match ? match[1] === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();

// Phones get the phone layout whatever width the browser claims: with "desktop site" (or a
// browser that starts in it, Brave for one) a phone reports a 980 px wide window and would
// get the desktop layout in a tiny font. Class "phone" on <html> switches the breakpoints
// off (index.css); the screen's own size and a touch screen tell a phone from a tablet.
(function () {
  try {
    var touch = window.matchMedia('(pointer: coarse)').matches;
    var ua = navigator.userAgent || '';
    var small = Math.min(screen.width, screen.height) < 600;
    var mobile = (navigator.userAgentData && navigator.userAgentData.mobile) || /Mobi|iPhone|iPod/.test(ua);
    if (touch && (small || mobile)) document.documentElement.classList.add('phone');
  } catch (e) {}
})();
