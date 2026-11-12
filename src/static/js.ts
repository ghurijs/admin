// Progressive-enhancement script for the admin, served at `<admin>/static/admin.js`. Every core flow works
// without it; it adds select-all for actions, the action counter, prepopulated slugs, inline "Add another"
// rows, multi-select filtering, the nav-sidebar toggle and autocomplete result picking.
export const ADMIN_JS = `
(function () {
  'use strict';
  function $(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---- changelist actions: select all / counter ----------------------------------------------
  function initActions() {
    var toggle = document.getElementById('action-toggle');
    var boxes = $('input.action-select');
    var counter = document.querySelector('.action-counter');
    var total = boxes.length;
    function update() {
      var n = boxes.filter(function (b) { return b.checked; }).length;
      boxes.forEach(function (b) { var tr = b.closest('tr'); if (tr) tr.classList.toggle('selected', b.checked); });
      if (counter) counter.textContent = n + ' of ' + total + ' selected';
      if (toggle) toggle.checked = n === total && total > 0;
      var across = document.querySelector('.actions .all');
      var question = document.querySelector('.actions .question');
      if (across && question) {
        question.classList.toggle('hidden', !(n === total && total > 0));
      }
    }
    if (toggle) toggle.addEventListener('change', function () { boxes.forEach(function (b) { b.checked = toggle.checked; }); update(); });
    boxes.forEach(function (b) { b.addEventListener('change', update); });
    var q = document.querySelector('.actions .question a');
    if (q) q.addEventListener('click', function (e) {
      e.preventDefault();
      $('input.select-across').forEach(function (i) { i.value = '1'; });
      var all = document.querySelector('.actions .all'); if (all) all.classList.remove('hidden');
      document.querySelector('.actions .question').classList.add('hidden');
      if (counter) counter.classList.add('hidden');
    });
    if (counter) update();
  }

  // ---- prepopulated fields (slugify) ------------------------------------------------------------
  function slugify(s, maxLength) {
    s = s.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '');
    s = s.toLowerCase().replace(/[^\\w\\s-]/g, '').trim().replace(/[-\\s]+/g, '-').replace(/^-+|-+$/g, '');
    return maxLength ? s.slice(0, maxLength).replace(/-+$/, '') : s;
  }
  function initPrepopulated(root) {
    $('[data-prepopulated-from]', root).forEach(function (target) {
      if (target.dataset.prepopulatedInit) return;
      target.dataset.prepopulatedInit = '1';
      var prefix = target.dataset.prepopulatedPrefix || '';
      var sources = JSON.parse(target.dataset.prepopulatedFrom).map(function (n) { return document.getElementById('id_' + prefix + n); }).filter(Boolean);
      var max = Number(target.getAttribute('maxlength')) || 50;
      if (target.value) target.dataset.changed = '1';
      target.addEventListener('change', function () { target.dataset.changed = target.value ? '1' : ''; });
      function populate() {
        if (target.dataset.changed) return;
        target.value = slugify(sources.map(function (s) { return s.value; }).filter(Boolean).join(' '), max);
      }
      sources.forEach(function (s) { s.addEventListener('keyup', populate); s.addEventListener('change', populate); s.addEventListener('focus', populate); });
    });
  }

  // ---- inline formsets: "Add another" -----------------------------------------------------------
  function initInlines() {
    $('.js-inline-admin-formset').forEach(function (group) {
      var prefix = group.dataset.prefix;
      var tpl = group.querySelector('template.empty-form-template');
      var total = document.getElementById('id_' + prefix + '-TOTAL_FORMS');
      var max = document.getElementById('id_' + prefix + '-MAX_NUM_FORMS');
      if (!tpl || !total) return;
      var container = group.querySelector('[data-inline-rows]');
      var adder = group.querySelector('.add-row');
      if (adder) adder.classList.remove('hidden');
      function refresh() {
        var n = Number(total.value);
        if (adder) adder.classList.toggle('hidden', max && max.value !== '' && n >= Number(max.value));
      }
      var link = group.querySelector('.add-row a');
      if (link) link.addEventListener('click', function (e) {
        e.preventDefault();
        var n = Number(total.value);
        var html = tpl.innerHTML.replace(/__prefix__/g, String(n));
        var holder = document.createElement(container.tagName === 'TBODY' ? 'tbody' : 'div');
        holder.innerHTML = html;
        var row = holder.firstElementChild;
        row.classList.add('dynamic-' + prefix);
        row.classList.remove('empty-form');
        row.id = prefix + '-' + n;
        var remover = row.querySelector('.inline-deletelink');
        if (remover) {
          remover.classList.remove('hidden');
          remover.addEventListener('click', function (ev) { ev.preventDefault(); row.remove(); renumber(); });
        }
        container.appendChild(row);
        total.value = String(n + 1);
        initPrepopulated(row);
        initAutocomplete(row);
        refresh();
      });
      function renumber() {
        var rows = $('.dynamic-' + prefix, group);
        var initial = Number(document.getElementById('id_' + prefix + '-INITIAL_FORMS').value);
        rows.forEach(function (row, i) {
          var idx = initial + i;
          var re = new RegExp('(' + prefix + '-)(\\\\d+|__prefix__)(-)');
          $('[name],[id],[for]', row).forEach(function (el) {
            ['name', 'id', 'for'].forEach(function (a) { var v = el.getAttribute(a); if (v) el.setAttribute(a, v.replace(re, '$1' + idx + '$3')); });
          });
        });
        total.value = String(initial + rows.length);
        refresh();
      }
      refresh();
    });
  }

  // ---- select multiple filter boxes ---------------------------------------------------------------
  function initSelectFilters() {
    $('input.selector-filter-input').forEach(function (input) {
      var select = document.getElementById(input.dataset.target);
      if (!select) return;
      input.classList.remove('hidden');
      input.addEventListener('input', function () {
        var q = input.value.toLowerCase();
        Array.prototype.forEach.call(select.options, function (o) { o.hidden = q !== '' && o.text.toLowerCase().indexOf(q) === -1 && !o.selected; });
      });
    });
  }

  // ---- autocomplete (htmx swaps results; clicking a result selects it) ---------------------------
  function initAutocomplete(root) {
    $('.autocomplete-widget', root).forEach(function (w) {
      if (w.dataset.init) return;
      w.dataset.init = '1';
      var search = w.querySelector('input[type=search]');
      if (search) search.classList.remove('hidden');
      var select = w.querySelector('select');
      w.addEventListener('click', function (e) {
        var item = e.target.closest('[data-autocomplete-id]');
        if (!item || !select) return;
        e.preventDefault();
        var id = item.dataset.autocompleteId;
        var existing = Array.prototype.find.call(select.options, function (o) { return o.value === id; });
        if (!select.multiple) Array.prototype.forEach.call(select.options, function (o) { o.selected = false; });
        if (existing) existing.selected = true;
        else { var opt = new Option(item.textContent, id, true, true); select.appendChild(opt); }
        var results = w.querySelector('.autocomplete-results'); if (results) results.innerHTML = '';
        if (search) search.value = '';
      });
    });
  }

  // ---- nav sidebar --------------------------------------------------------------------------------
  function initNavSidebar() {
    var toggle = document.getElementById('toggle-nav-sidebar');
    var main = document.getElementById('main');
    if (!toggle || !main) return;
    var stored = null;
    try { stored = localStorage.getItem('ghuri.admin.navSidebarIsOpen'); } catch (e) {}
    if (stored !== null) main.classList.toggle('shifted', stored === 'true');
    toggle.addEventListener('click', function () {
      var open = !main.classList.contains('shifted');
      main.classList.toggle('shifted', open);
      try { localStorage.setItem('ghuri.admin.navSidebarIsOpen', String(open)); } catch (e) {}
    });
    var filter = document.getElementById('nav-filter');
    if (filter) {
      filter.classList.remove('hidden');
      filter.addEventListener('input', function () {
        var q = filter.value.toLowerCase();
        $('#nav-sidebar tr[class^="model-"]').forEach(function (tr) { tr.hidden = q !== '' && tr.textContent.toLowerCase().indexOf(q) === -1; });
      });
    }
  }

  // ---- confirm dialogs: "No, take me back" ------------------------------------------------------
  function initCancelLinks() {
    $('.cancel-link').forEach(function (a) {
      a.addEventListener('click', function (e) { if (history.length > 1) { e.preventDefault(); history.back(); } });
    });
  }

  function init() {
    initActions(); initPrepopulated(document); initInlines(); initSelectFilters(); initAutocomplete(document);
    initNavSidebar(); initCancelLinks();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('htmx:afterSwap', function (e) { initAutocomplete(e.target.closest('.autocomplete-widget') || document); });
})();
`
