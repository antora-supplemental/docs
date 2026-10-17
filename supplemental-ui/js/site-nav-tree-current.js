/**
 * Prefer the deepest is-current-page when site-nav-tree inlines many components.
 * Default UI expands only the first match; a duplicated start-page URL on the
 * component root then leaves children behind an inactive anonymous wrapper.
 *
 * Also retains expand/collapse state across page navigations via sessionStorage
 * so opening other component trees is not wiped when the current-path rewrite
 * runs (which clears and re-applies is-active along the active page only).
 *
 * Expand keys use component-absolute pathnames (not relative hrefs) so SoftNav
 * depth changes and absolutize() do not look like inject/remove of the tree.
 *
 * Nav panel scrollTop is persisted separately so left-rail position survives
 * SoftNav swaps and full document loads independently of the content column.
 *
 * Does not blank the tree (no visibility:hidden / data-snt-nav-ready hide).
 * Scroll saves are debounced; SoftNav before/unload flush immediately.
 */
;(function () {
  'use strict'

  // v2: pathname keys (stable across URL depth / SoftNav absolutize)
  var STORAGE_KEY = 'site-nav-tree:expanded-v2'
  var SCROLL_KEY = 'site-nav-tree:scroll-y'
  var scrollSaveTimer = null

  function normalizeHref (href) {
    if (!href) return ''
    try {
      var u = new URL(href, window.location.href)
      var path = u.pathname || '/'
      path = path.replace(/\/index\.html$/i, '/')
      if (path.length > 1) path = path.replace(/\/+$/, '/') || '/'
      return path
    } catch (e) {
      return String(href).split(/[?#]/)[0]
    }
  }

  function itemKey (el) {
    var link = el.querySelector(':scope > .nav-link')
    var href = link && link.getAttribute('href')
    if (href) return 'h:' + normalizeHref(href)
    var labelEl = el.querySelector(':scope > .nav-text, :scope > .nav-link')
    var label = ((labelEl && labelEl.textContent) || '').trim().replace(/\s+/g, ' ')
    var parts = [(el.getAttribute('data-depth') || '0') + ':' + label]
    var parent = el.parentElement ? el.parentElement.closest('li.nav-item') : null
    while (parent) {
      var plink = parent.querySelector(':scope > .nav-link')
      var phref = plink && plink.getAttribute('href')
      if (phref) {
        parts.unshift('h:' + normalizeHref(phref))
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
      /* private mode / quota - ignore */
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

  function navScrollEl () {
    return document.querySelector('.nav-container [data-panel=menu]')
  }

  function saveNavScrollNow () {
    var el = navScrollEl()
    if (!el) return
    try {
      sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop || 0))
    } catch (e) {
      /* ignore */
    }
  }

  function saveNavScroll () {
    if (scrollSaveTimer != null) return
    scrollSaveTimer = window.setTimeout(function () {
      scrollSaveTimer = null
      saveNavScrollNow()
    }, 100)
  }

  function flushNavScroll () {
    if (scrollSaveTimer != null) {
      window.clearTimeout(scrollSaveTimer)
      scrollSaveTimer = null
    }
    saveNavScrollNow()
  }

  function restoreNavScroll () {
    var el = navScrollEl()
    if (!el) return
    var raw
    try {
      raw = sessionStorage.getItem(SCROLL_KEY)
    } catch (e) {
      return
    }
    if (raw == null || raw === '') return
    var y = parseInt(raw, 10)
    if (isNaN(y)) return
    el.scrollTop = y
    requestAnimationFrame(function () {
      var again = navScrollEl()
      if (again) again.scrollTop = y
    })
  }

  /**
   * After SoftNav swaps (or marks current), restore remembered expansion *and*
   * the current-page path without collapsing non-current siblings the reader
   * left open under other (or the same) component roots.
   */
  function siteNavTreeCurrent () {
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu) {
      try {
        document.documentElement.setAttribute('data-snt-nav-ready', '1')
      } catch (e) {
        /* ignore */
      }
      return
    }

    var remembered = loadExpanded()

    var currents = [].slice.call(menu.querySelectorAll('.nav-item.is-current-page'))
    if (!currents.length) {
      applyExpanded(menu, remembered)
      persistMenu(menu)
      restoreNavScroll()
      markOverviewLabels(menu)
      try {
        document.documentElement.setAttribute('data-snt-nav-ready', '1')
      } catch (e) {
        /* ignore */
      }
      return
    }

    currents.sort(function (a, b) {
      return (parseInt(b.getAttribute('data-depth'), 10) || 0) - (parseInt(a.getAttribute('data-depth'), 10) || 0)
    })
    var best = currents[0]

    currents.forEach(function (el) {
      if (el !== best) el.classList.remove('is-current-page')
    })

    menu.querySelectorAll('.nav-item.is-current-path').forEach(function (el) {
      el.classList.remove('is-current-path')
    })
    menu.querySelectorAll('.nav-item.is-active').forEach(function (el) {
      el.classList.remove('is-active')
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
    restoreNavScroll()
    markOverviewLabels(menu)
    try {
      document.documentElement.setAttribute('data-snt-nav-ready', '1')
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * SoftNav keeps the live forest DOM (no panel wipe). Mark the deepest nav-link
   * matching destPath as is-current-page, then expand via siteNavTreeCurrent.
   */
  function markCurrentByPath (pathname) {
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu) return
    var want = normalizeHref(pathname)
    if (!want) return
    var matches = []
    menu.querySelectorAll('a.nav-link').forEach(function (a) {
      if (normalizeHref(a.getAttribute('href') || a.href) === want) {
        var li = a.closest('li.nav-item')
        if (li) matches.push(li)
      }
    })
    if (!matches.length) return
    matches.sort(function (a, b) {
      return (parseInt(b.getAttribute('data-depth'), 10) || 0) - (parseInt(a.getAttribute('data-depth'), 10) || 0)
    })
    menu.querySelectorAll('.nav-item.is-current-page').forEach(function (el) {
      el.classList.remove('is-current-page')
    })
    matches[0].classList.add('is-current-page')
  }

  function isOverviewLabel (text) {
    var t = String(text || '').trim().replace(/\s+/g, ' ').toLowerCase()
    return t === 'overview' || t === 'home'
  }

  function directChild (el, tagName, className) {
    var kids = (el && el.children) || []
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i]
      if (k.tagName === tagName && (!className || (k.classList && k.classList.contains(className)))) return k
    }
    return null
  }

  /**
   * Overview link for a nav node: the first direct child item that is a link
   * labelled Overview (or Home). Mirrors build-site-navigation.js, which emits
   * an Overview leaf under every component root / promoted section.
   */
  function overviewLinkFor (li) {
    var list = directChild(li, 'UL', 'nav-list')
    if (!list) return null
    var kids = list.children || []
    for (var i = 0; i < kids.length; i++) {
      var item = kids[i]
      if (item.tagName !== 'LI') continue
      var a = directChild(item, 'A', 'nav-link')
      if (a && isOverviewLabel(a.textContent) && a.getAttribute('href')) return a
    }
    return null
  }

  function hasModifier (e) {
    return !!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || (e.button && e.button !== 0))
  }

  function currentPathname () {
    try {
      return normalizeHref(window.location.pathname)
    } catch (e) {
      return ''
    }
  }

  /**
   * SoftNav when available; otherwise activate the Overview anchor. Skips redundant
   * navigations when the reader is already on the Overview URL (avoids hard reload
   * when SoftNav samePath does not preventDefault on in-page nav-link clicks).
   */
  function openOverview (overview) {
    if (!overview) return
    var href = overview.getAttribute('href') || overview.href
    if (!href) return
    var dest = normalizeHref(href)
    if (dest && dest === currentPathname()) return
    if (window.SoftNav && typeof window.SoftNav.navigate === 'function') {
      try {
        window.SoftNav.navigate(new URL(href, window.location.href).href)
        return
      } catch (e) {
        /* fall through */
      }
    }
    overview.click()
  }

  /**
   * Unlinked section labels with an Overview child get .snt-overview-label so
   * Valentus nav-tree hover/focus chrome matches linked component roots (.nav-link).
   */
  function markOverviewLabels (menu) {
    if (!menu) return
    menu.querySelectorAll('li.nav-item').forEach(function (li) {
      if (overviewLinkFor(li)) li.classList.add('snt-overview-label')
      else li.classList.remove('snt-overview-label')
    })
  }

  /**
   * Parent label with an Overview child: one click expands the node *and* opens
   * the Overview article. Never collapses (the caret button still toggles).
   * - Unlinked label (Core, Extensions): stock Default UI would only toggle, so
   *   take over in capture phase and open Overview via SoftNav when present.
   * - Linked label (component root): expand first, then let the link navigate
   *   (or redirect to Overview when the URLs differ).
   * Nodes without an Overview child keep stock behavior.
   */
  function onLabelClick (e) {
    if (e.defaultPrevented || hasModifier(e)) return
    var target = e.target
    if (!target || !target.closest) return
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu || !menu.contains(target)) return
    if (target.closest('.nav-item-toggle')) return

    var link = target.closest('a.nav-link')
    var label = link || target.closest('.nav-text')
    if (!label) return
    var li = label.parentNode
    if (!li || li.tagName !== 'LI' || !li.classList.contains('nav-item')) return

    var overview = overviewLinkFor(li)
    if (!overview) return

    li.classList.add('is-active')
    persistMenu(menu)

    var overviewPath = normalizeHref(overview.getAttribute('href') || overview.href)
    var onOverviewPage = overviewPath && overviewPath === currentPathname()

    if (link) {
      if (link === overview || normalizeHref(link.getAttribute('href')) === overviewPath) {
        if (onOverviewPage) e.preventDefault()
        return
      }
      e.preventDefault()
      openOverview(overview)
      return
    }
    e.stopPropagation()
    e.preventDefault()
    openOverview(overview)
  }

  function onToggleClick (e) {
    var toggle = e.target && e.target.closest && e.target.closest('.nav-item-toggle')
    if (!toggle) return
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu || !menu.contains(toggle)) return
    setTimeout(function () {
      persistMenu(menu)
    }, 0)
  }

  window.siteNavTreeCurrent = siteNavTreeCurrent
  window.siteNavTreeMarkCurrentByPath = markCurrentByPath
  window.siteNavTreeSaveScroll = flushNavScroll
  window.siteNavTreeRestoreScroll = restoreNavScroll

  window.siteNavTreeOverviewLink = overviewLinkFor
  window.siteNavTreeMarkOverviewLabels = markOverviewLabels
  document.addEventListener('click', onToggleClick)
  document.addEventListener('click', onLabelClick, true)

  // Debounced persist while the reader moves the left rail only.
  document.addEventListener(
    'scroll',
    function (e) {
      var el = navScrollEl()
      if (!el) return
      if (e.target === el || (e.target && el.contains(e.target))) saveNavScroll()
    },
    true
  )
  function bindPanelScroll () {
    var el = navScrollEl()
    if (!el || el.getAttribute('data-snt-scroll-bound')) return
    el.setAttribute('data-snt-scroll-bound', '1')
    el.addEventListener('scroll', saveNavScroll, { passive: true })
  }
  bindPanelScroll()
  window.addEventListener('beforeunload', flushNavScroll)
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest && e.target.closest('a.nav-link')
      if (!a) return
      var panel = navScrollEl()
      if (panel && panel.contains(a)) flushNavScroll()
    },
    true
  )

  siteNavTreeCurrent()
  bindPanelScroll()

  function onSoftNavLoaded (fn) {
    if (window.SoftNav && typeof window.SoftNav.on === 'function') window.SoftNav.on('loaded', fn)
    else document.addEventListener('soft-nav:loaded', function (e) { fn(e.detail || {}) })
  }
  function onSoftNavBefore (fn) {
    if (window.SoftNav && typeof window.SoftNav.on === 'function') window.SoftNav.on('before', fn)
    else document.addEventListener('soft-nav:before', function (e) { fn(e.detail || {}) })
  }
  onSoftNavBefore(function () {
    flushNavScroll()
  })
  onSoftNavLoaded(function (detail) {
    if (detail && detail.url && typeof markCurrentByPath === 'function') {
      try {
        markCurrentByPath(detail.url)
      } catch (e) {
        /* ignore */
      }
    }
    siteNavTreeCurrent()
    bindPanelScroll()
    restoreNavScroll()
  })
})()