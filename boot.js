/* Sample preview: layout helper only (no key or address handling, no storage). */
(function () { var de = document.documentElement; function fit() { de.classList.toggle('wide', window.innerWidth >= 960); } fit(); window.addEventListener('resize', fit); })();
