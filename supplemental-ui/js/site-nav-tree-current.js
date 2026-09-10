/**
 * Prefer the deepest is-current-page when site-nav-tree inlines many components.
 * Default UI expands only the first match; a duplicated start-page URL on the
 * component root then leaves children behind an inactive anonymous wrapper.
 *
 * Also retains expand/collapse state across page navigations via sessionStorage
 * so opening other component trees is not wiped when the current-path rewrite
 * runs (which clears and re-applies is-active along the active page only).
 */
;(function () {
  'use strict'

  var STORAGE_KEY = 'site-nav-tree:expanded-v1'

  function itemKey (el) {
    var link = el.querySelector(':scope > .nav-link')
    var href = link && link.getAttribute('href')
    if (href) return 'h:' + href
    var labelEl = el.querySelector(':scope > .nav-text, :scope > .nav-link')
    var label = ((labelEl && labelEl.textContent) || '').trim().replace(/\s+/g, ' ')
    var parts = [(el.getAttribute('data-depth') || '0') + ':' + label]
    var parent = el.parentElement ? el.parentElement.closest('li.nav-item') : null
    while (parent) {
      var plink = parent.querySelector(':scope > .nav-link')
      var phref = plink && plink.getAttribute('href')
      if (phref) {
        parts.unshift('h:' + phref)
      } else {
        var plabelEl = parent.querySelector(':scope > .nav-text, :scope > .nav-link')
        var plabel = ((plabelEl && plabelEl.textContent) || '').trim().replace(/\s+/g, ' ')
        parts.unshift((parent.getAttribute('data-depth') || '0') + ':' + plabel)
      }
      parent = parent.parentElement ? parent.parentElement.closest('li.nav-item') : null
    }
    return 'p:' + parts.join('/')
  }

  function loadExpanded () {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY)
      var parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  }

  function saveExpanded (keys) {
    try {
      var unique = []
      var seen = Object.create(null)
      keys.forEach(function (k) {
        if (!k || seen[k]) return
        seen[k] = true
        unique.push(k)
      })
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(unique))
    } catch (e) {
      /* private mode / quota — ignore */
    }
  }

  function collectExpanded (menu) {
    return [].slice.call(menu.querySelectorAll('.nav-item.is-active')).map(itemKey)
  }

  function applyExpanded (menu, keys) {
    if (!keys || !keys.length) return
    var want = Object.create(null)
    keys.forEach(function (k) {
      want[k] = true
    })
    menu.querySelectorAll('.nav-item').forEach(function (el) {
      if (want[itemKey(el)]) el.classList.add('is-active')
    })
  }

  function persistMenu (menu) {
    if (!menu) return
    saveExpanded(collectExpanded(menu))
  }

  function siteNavTreeCurrent () {
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu) return

    var remembered = loadExpanded()

    var currents = [].slice.call(menu.querySelectorAll('.nav-item.is-current-page'))
    if (!currents.length) {
      applyExpanded(menu, remembered)
      persistMenu(menu)
      return
    }

    currents.sort(function (a, b) {
      return (parseInt(b.getAttribute('data-depth'), 10) || 0) - (parseInt(a.getAttribute('data-depth'), 10) || 0)
    })
    var best = currents[0]

    currents.forEach(function (el) {
      if (el !== best) el.classList.remove('is-current-page')
    })

    // Drop path markers and expansion from a prior page; sessionStorage restores
    // trees the reader left open outside the new current path.
    menu.querySelectorAll('.nav-item.is-active, .nav-item.is-current-path').forEach(function (el) {
      el.classList.remove('is-active', 'is-current-path')
    })

    var node = best
    while (node && !(node.classList && node.classList.contains('nav-menu'))) {
      if (node.tagName === 'LI' && node.classList.contains('nav-item')) {
        node.classList.add('is-active', 'is-current-path')
      }
      node = node.parentNode
    }
    best.classList.add('is-active', 'is-current-page')

    applyExpanded(menu, remembered)
    persistMenu(menu)
  }

  function onToggleClick (e) {
    var toggle = e.target && e.target.closest && e.target.closest('.nav-item-toggle')
    if (!toggle) return
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu || !menu.contains(toggle)) return
    // Default UI toggles is-active synchronously on click; persist after that.
    setTimeout(function () {
      persistMenu(menu)
    }, 0)
  }

  window.siteNavTreeCurrent = siteNavTreeCurrent
  document.addEventListener('click', onToggleClick)
  siteNavTreeCurrent()
})()
