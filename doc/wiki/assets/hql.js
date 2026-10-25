/* The HQL tab in the top bar: an abbreviation that spells itself out on hover.
 *
 * The theme renders the tab as a link with its title as bare text. Letter-by-
 * letter animation needs one element per letter, and the one place that could
 * emit them is a theme template — which the site does not override, by policy
 * (see `doc/status/pages.md`). So the markup is built here, at load time, from
 * the link the theme already emitted. Without this script the tab is a plain
 * link that reads "HQL", which is the correct degraded state.
 *
 * The letters that stay — H, Q, L — are the capitals of the full name; every
 * other letter collapses to zero width until hovered, and the button grows
 * with them. The stagger is CSS, driven by the index each letter carries. */
(function () {
  "use strict";

  var HOST = "https://hql-lang.org";
  var FULL = "HyperQueryLanguage";

  function mount() {
    var link = document.querySelector('.md-tabs__link[href^="' + HOST + '"]');
    if (!link || link.classList.contains("hql-tab")) {
      return;
    }

    var short = link.textContent.trim();

    var text = document.createElement("span");
    text.className = "hql-tab__text";
    text.setAttribute("aria-hidden", "true");

    var hidden = FULL.replace(/[A-Z]/g, "").length;
    var index = 0;
    for (var k = 0; k < FULL.length; k++) {
      var letter = FULL.charAt(k);
      if (letter === letter.toUpperCase()) {
        text.appendChild(document.createTextNode(letter));
        continue;
      }
      var ghost = document.createElement("span");
      ghost.className = "hql-tab__ghost";
      ghost.style.setProperty("--hql-i", String(index++));
      ghost.style.setProperty("--hql-n", String(hidden));
      var inner = document.createElement("span");
      inner.textContent = letter;
      ghost.appendChild(inner);
      text.appendChild(ghost);
    }

    link.textContent = "";
    link.setAttribute("aria-label", short + ", the " + FULL);
    link.appendChild(text);
    link.classList.add("hql-tab");
  }

  // Material exposes `document$` and emits on every page load, including the
  // instant-navigation kind should that feature ever be switched on.
  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(mount);
  } else {
    mount();
  }
})();
