/** Runs before the application/router starts, including on uncached refresh aliases. */
(function () {
  var script = document.currentScript;
  var site = script && script.getAttribute('data-qisheng-fresh');
  if (site !== 'game' && site !== 'campus') return;
  var path = location.pathname;
  if (path !== '/__fresh' && path.indexOf('/__fresh/') !== 0) return;
  var route = path === '/__fresh' ? '/' : path.slice('/__fresh'.length);
  if (/[?#%\\]/.test(route)) return;
  var allowed = ['school', 'making', 'astra', 'game', 'explore', 'feedback'];
  var canonical = route === '/' || route === '/index.html' ? '/' : null;
  if (site === 'campus') for (var i = 0; i < allowed.length; i++) {
    if (route === '/' + allowed[i] || route === '/' + allowed[i] + '/' || route === '/' + allowed[i] + '.html') canonical = '/' + allowed[i];
  }
  if (canonical === null) return;
  var url = new URL(location.href);
  var expected = url.searchParams.get('_release');
  var marker = document.querySelector('meta[name="qisheng-release"]');
  if (expected && (!marker || marker.content !== expected)) return;
  url.searchParams.delete('_release');
  var query = url.searchParams.toString();
  history.replaceState(history.state, '', canonical + (query ? '?' + query : '') + location.hash);
}());
