/* The cover's live editor.
 *
 * Adds a "Try it" tab to the window in the hero: one card of the example
 * vault, typed into, rendered and linted in the page. This file only builds
 * the tab. The implementation is `hmd-demo.bundle.js`, built from the
 * TypeScript core by `scripts/build-site-demo.mjs` and fetched the first time
 * the tab is opened, so a visitor who never opens it downloads nothing.
 *
 * Without this script, or without the bundle, the window keeps its five
 * recorded tabs and nothing on the page is missing.
 */
(function () {
  var BUNDLE = "hmd-demo.bundle.js";

  function assetBase() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      if (/hmd-demo\.js(\?|$)/.test(src)) return scripts[i].src.replace(/hmd-demo\.js.*$/, "");
    }
    return null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function mount() {
    var term = document.querySelector(".hmd-term");
    var bar = term && term.querySelector(".hmd-tabbar");
    var base = assetBase();
    if (!term || !bar || !base || term.querySelector('[data-tab="try"]')) return;

    var input = document.createElement("input");
    input.type = "radio";
    input.name = "hmd-demo";
    input.id = "hmd-demo-try";
    input.value = "try";
    var label = el("label", "hmd-tabbar__try", "Try it");
    label.htmlFor = input.id;
    bar.appendChild(input);
    bar.appendChild(label);

    var pane = el("div", "hmd-pane hmd-live");
    pane.setAttribute("data-tab", "try");

    var name = el("label", "hmd-live__name", "notes.hmd");
    name.htmlFor = "hmd-live-source";
    var hint = el("span", "hmd-live__hint", "edit this card");
    name.appendChild(hint);
    var source = el("textarea", "hmd-live__source");
    source.id = "hmd-live-source";
    source.spellcheck = false;
    source.setAttribute("autocapitalize", "off");
    source.setAttribute("autocomplete", "off");
    source.rows = 9;

    var out = el("div", "hmd-out hmd-live__out");
    out.setAttribute("data-label", "rendered");
    out.setAttribute("aria-live", "polite");
    var log = el("pre", "hmd-live__log");
    log.setAttribute("aria-label", "Diagnostics");
    var note = el(
      "p",
      "hmd-live__note",
      "The card sits in the example vault. Two cards there are named tokens: write [[tokens]] and the check reports it.",
    );

    pane.appendChild(name);
    pane.appendChild(source);
    pane.appendChild(out);
    pane.appendChild(log);
    pane.appendChild(note);
    term.appendChild(pane);

    var api = null;
    var loading = null;
    var timer = 0;
    var turn = 0;

    function show(result) {
      out.innerHTML = result.html;
      log.textContent = result.diagnostics.length
        ? result.diagnostics.join("\n") +
          "\n\n" + result.errors + " error(s), " + result.warnings + " warning(s)"
        : "clean: no diagnostics";
      log.classList.toggle("hmd-live__log--error", result.errors > 0);
    }

    function update() {
      if (!api) return;
      var mine = ++turn;
      api.run(source.value).then(function (result) {
        if (mine === turn) show(result);
      });
    }

    function load() {
      if (loading) return loading;
      log.textContent = "loading…";
      loading = import(base + BUNDLE).then(
        function (module) {
          api = module;
          source.value = module.START;
          update();
        },
        function () {
          log.textContent = "The editor could not be loaded. The other tabs show recorded output.";
          source.disabled = true;
        },
      );
      return loading;
    }

    input.addEventListener("change", load);
    source.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    });
    // Tab indents; it does not leave the editor. Escape then Tab does.
    var escaped = false;
    source.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        escaped = true;
        return;
      }
      if (event.key === "Tab" && !escaped && !event.shiftKey) {
        event.preventDefault();
        source.setRangeText("    ", source.selectionStart, source.selectionEnd, "end");
        update();
      }
      escaped = false;
    });
  }

  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(mount);
  } else {
    mount();
  }
})();
