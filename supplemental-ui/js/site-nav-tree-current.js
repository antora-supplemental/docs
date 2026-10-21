/**
 * Prefer the deepest is-current-page *within the owning component* when
 * site-nav-tree inlines many components. Default UI expands only the first
 * match; a duplicated start-page URL on the component root then leaves children
 * behind an inactive anonymous wrapper. Cross-component nav xrefs (same URL in
 * another forest root) must not win over the real component landing.
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

  function isRelativeNavHref (raw) {
    if (!raw || raw.charAt(0) === '#') return false
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false
    return raw.charAt(0) !== '/'
  }

  /** Page URL that produced the live forest (stable while SoftNav keeps the panel). */
  function navMenuBaseHref (menu, explicitBase) {
    if (explicitBase) {
      if (menu) menu.setAttribute('data-snt-nav-base', explicitBase)
      return explicitBase
    }
    if (!menu) return window.location.href
    var stored = menu.getAttribute('data-snt-nav-base')
    if (stored) return stored
    var base = window.location.href
    menu.setAttribute('data-snt-nav-base', base)
    return base
  }

  /**
   * Antora emits nav-link hrefs relative to the page that rendered the tree.
   * SoftNav keeps the live forest DOM; freeze each link to a site-root pathname
   * using that stored base (not the current article URL after a swap).
   */
  function absolutizeNavLinkHrefs (menu, baseHref) {
    if (!menu) return
    var base
    try {
      base = new URL(navMenuBaseHref(menu, baseHref))
    } catch (e) {
      return
    }
    menu.querySelectorAll('a.nav-link').forEach(function (a) {
      var raw = a.getAttribute('href')
      if (!raw || raw.charAt(0) === '#') return
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        var pathOnly = normalizeHref(raw)
        if (pathOnly) a.setAttribute('href', pathOnly)
        return
      }
      try {
        var resolved = new URL(raw, base.href)
        if (resolved.origin !== base.origin) return
        a.setAttribute('href', normalizeHref(resolved.pathname))
      } catch (e2) {
        /* leave as-is */
      }
    })
  }

  function menuHasRelativeNavHrefs (menu) {
    if (!menu) return false
    var rel = false
    menu.querySelectorAll('a.nav-link').forEach(function (a) {
      if (isRelativeNavHref(a.getAttribute('href'))) rel = true
    })
    return rel
  }

  function prepareNavMenu (menu, baseHref) {
    if (!menu) return
    absolutizeNavLinkHrefs(menu, baseHref)
    if (menuHasRelativeNavHrefs(menu)) menu.removeAttribute('data-snt-hrefs-absolutized')
    else menu.setAttribute('data-snt-hrefs-absolutized', '1')
  }

  function resolveNavLinkUrl (raw, menu) {
    if (!raw || raw.charAt(0) === '#') return null
    menu = menu || document.querySelector('.nav-container [data-panel=menu]')
    prepareNavMenu(menu)
    var base = navMenuBaseHref(menu)
    try {
      if (raw.charAt(0) === '/') return new URL(raw, window.location.origin).href
      return new URL(raw, base).href
    } catch (e) {
      return null
    }
  }

  /** Pathname for matching nav links; relative hrefs use the forest base, not the live article URL. */
  function navLinkPathname (a, menu) {
    if (!a) return ''
    menu = menu || document.querySelector('.nav-container [data-panel=menu]')
    prepareNavMenu(menu)
    var raw = a.getAttribute('href')
    if (!raw || raw.charAt(0) === '#') return ''
    if (isRelativeNavHref(raw)) {
      var abs = resolveNavLinkUrl(raw, menu)
      return abs ? normalizeHref(abs) : ''
    }
    return normalizeHref(raw)
  }

  /** Copy site forest nav onto Antora's empty 404 layout (no page.navigation). */
  function hydrate404Nav () {
    if (!document.body || !document.body.classList.contains('status-404')) return
    var panel = document.querySelector('.nav-container [data-panel=menu]')
    if (!panel) return
    var menu = panel.querySelector('nav.nav-menu')
    if (!menu || menu.querySelector('li.nav-item')) return
    var start = '/docs/'
    var startAnchor = document.querySelector('article.doc a[href^="/"]')
    if (startAnchor && startAnchor.getAttribute('href')) start = startAnchor.getAttribute('href')
    else {
      var forestRoot = document.querySelector(
        '.nav-container [data-panel=menu] li.nav-item[data-depth="0"] > a.nav-link[href^="/"]'
      )
      if (forestRoot && forestRoot.getAttribute('href')) start = forestRoot.getAttribute('href')
    }
    var startAbs
    try {
      startAbs = new URL(start, window.location.origin).href
    } catch (e) {
      startAbs = start
    }
    fetch(startAbs, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed')
        return res.text()
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html')
        var freshPanel = doc.querySelector('.nav-container [data-panel=menu]')
        if (!freshPanel) return
        panel.innerHTML = freshPanel.innerHTML
        var again = document.querySelector('.nav-container [data-panel=menu]')
        if (again) {
          again.removeAttribute('data-snt-hrefs-absolutized')
          again.removeAttribute('data-snt-nav-base')
          prepareNavMenu(again, startAbs)
        }
        siteNavTreeCurrent()
        bindPanelScroll()
        restoreNavScroll()
      })
      .catch(function () {
        /* ignore */
      })
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
    prepareNavMenu(menu)
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
      linkifyBreadcrumbSectionCrumbs(menu)
      try {
        document.documentElement.setAttribute('data-snt-nav-ready', '1')
      } catch (e) {
        /* ignore */
      }
      return
    }

    var wantPath = currentPathname()
    var best = pickBestCurrentPageItem(currents, wantPath, menu)
    if (!best) best = currents[0]

    menu.querySelectorAll('.nav-item.is-current-path').forEach(function (el) {
      el.classList.remove('is-current-path')
    })
    menu.querySelectorAll('.nav-item.is-active').forEach(function (el) {
      el.classList.remove('is-active')
    })

    var node = best
    while (node && !(node.classList && node.classList.contains('nav-menu'))) {
      if (node.tagName === 'LI' && node.classList.contains('nav-item')) {
        if (node !== best) node.classList.remove('is-current-page')
        node.classList.add('is-active', 'is-current-path')
      }
      node = node.parentNode
    }
    menu.querySelectorAll('.nav-item.is-current-page').forEach(function (el) {
      if (el !== best) el.classList.remove('is-current-page')
    })
    best.classList.add('is-active', 'is-current-page')

    applyExpanded(menu, remembered)
    maybeExpandForestRootLanding(menu, wantPath)
    persistMenu(menu)
    restoreNavScroll()
    markOverviewLabels(menu)
    linkifyBreadcrumbSectionCrumbs(menu)
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
    prepareNavMenu(menu)
    var want = normalizeHref(pathname)
    if (!want) return
    var matches = []
    menu.querySelectorAll('a.nav-link').forEach(function (a) {
      if (navLinkPathname(a, menu) === want) {
        var li = a.closest('li.nav-item')
        if (li) matches.push(li)
      }
    })
    if (!matches.length) {
      menu.querySelectorAll('.nav-item.is-current-page').forEach(function (el) {
        el.classList.remove('is-current-page')
      })
      siteNavTreeCurrent()
      return
    }
    var best = pickBestCurrentPageItem(matches, want, menu)
    if (!best) best = matches[0]
    menu.querySelectorAll('.nav-item.is-current-page').forEach(function (el) {
      el.classList.remove('is-current-page')
    })
    best.classList.add('is-current-page')
    siteNavTreeCurrent()
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

  function navDepth (el) {
    return parseInt(el && el.getAttribute('data-depth'), 10) || 0
  }

  /** Forest depth-0 component root for a nav item (Platforms, General Knowledge, …). */
  function forestOwnerRootOf (li) {
    if (!li || !li.closest) return null
    var root = li
    while (root) {
      if (root.classList && root.classList.contains('nav-item') && navDepth(root) === 0) return root
      root = root.parentElement ? root.parentElement.closest('li.nav-item') : null
    }
    return null
  }

  function componentRootHref (li) {
    var root = forestOwnerRootOf(li)
    if (!root) return ''
    var a = root.querySelector(':scope > .nav-link')
    var menu =
      (li && li.closest && li.closest('.nav-container [data-panel=menu]')) ||
      document.querySelector('.nav-container [data-panel=menu]')
    return a ? navLinkPathname(a, menu) : ''
  }

  function findForestOwnerRootForPath (menu, pathname) {
    if (!menu || !pathname) return null
    var want = normalizeHref(pathname)
    var found = null
    menu.querySelectorAll('li.nav-item[data-depth="0"]').forEach(function (li) {
      if (pathUnderComponentRoot(want, componentRootHref(li))) found = li
    })
    return found
  }

  /** Open every top-level section under a forest component root (Diátaxis branches). */
  function expandForestRootSections (rootLi) {
    if (!rootLi || navDepth(rootLi) !== 0) return
    rootLi.classList.add('is-active')
    var list = directChild(rootLi, 'UL', 'nav-list')
    if (!list) return
    var kids = list.children || []
    for (var i = 0; i < kids.length; i++) {
      var item = kids[i]
      if (item.tagName === 'LI' && item.classList.contains('nav-item')) item.classList.add('is-active')
    }
  }

  function maybeExpandForestRootLanding (menu, pathname) {
    if (!menu || !pathname) return
    var owner = findForestOwnerRootForPath(menu, pathname)
    if (!owner) return
    if (normalizeHref(pathname) !== componentRootHref(owner)) return
    expandForestRootSections(owner)
  }

  /** True when pathname is the component landing or a page under that root. */
  function pathUnderComponentRoot (pathname, rootHref) {
    if (!pathname || !rootHref) return false
    if (pathname === rootHref) return true
    if (rootHref === '/') return pathname.indexOf('/') === 0
    var prefix = rootHref.replace(/\/+$/, '')
    return pathname.indexOf(prefix + '/') === 0
  }

  /**
   * Among nav items marked current for one URL, prefer matches under the forest
   * component root that owns the pathname, then the deepest within that subtree.
   */
  function pickBestCurrentPageItem (items, pathname, menu) {
    if (!items || !items.length) return null
    var want = normalizeHref(pathname || currentPathname())
    menu =
      menu ||
      (items[0] && items[0].closest && items[0].closest('.nav-container [data-panel=menu]')) ||
      document.querySelector('.nav-container [data-panel=menu]')
    var ownerRoot = menu && want ? findForestOwnerRootForPath(menu, want) : null
    var owned = ownerRoot
      ? items.filter(function (li) {
        return forestOwnerRootOf(li) === ownerRoot
      })
      : want
        ? items.filter(function (li) {
          return pathUnderComponentRoot(want, componentRootHref(li))
        })
        : []
    var pool = owned.length ? owned : items
    // Deepest match wins even on a component/section landing: the root and
    // its Overview leaf share one URL, and only the Overview leaf may carry
    // is-current-page. Ancestors get is-current-path from siteNavTreeCurrent.
    pool = pool.slice().sort(function (a, b) {
      return navDepth(b) - navDepth(a)
    })
    return pool[0]
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
  /**
   * Promoted section landings are unlinked in the tree (their Overview leaf
   * owns the URL), so Antora renders their breadcrumb crumb as plain text.
   * Re-link those crumbs to the section's Overview href; the current crumb
   * and already-linked crumbs are left alone.
   */
  function linkifyBreadcrumbSectionCrumbs (menu) {
    try {
      if (!menu || !document.querySelectorAll) return
      var trails = document.querySelectorAll(
        '.valentus-breadcrumb-trail, nav.breadcrumbs li, .breadcrumbs li'
      )
      ;[].forEach.call(trails, function (li) {
        if (!li || (li.classList && li.classList.contains('valentus-breadcrumb-trail--current'))) return
        if (li.querySelector && li.querySelector('a')) return
        var span = li.querySelector
          ? li.querySelector('.valentus-breadcrumb-trail-text, span')
          : null
        if (!span) return
        var label = String(span.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase()
        if (!label) return
        var overview = null
        ;[].forEach.call(menu.querySelectorAll('li.nav-item'), function (item) {
          if (overview) return
          var textEl = item.querySelector
            ? item.querySelector(':scope > .nav-text')
            : null
          if (!textEl) return
          var text = String(textEl.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase()
          if (text === label) overview = overviewLinkFor(item)
        })
        if (!overview) return
        var doc = span.ownerDocument || document
        if (!doc.createElement) return
        var a = doc.createElement('a')
        a.setAttribute('class', 'valentus-breadcrumb-trail-link')
        a.setAttribute('href', overview.getAttribute('href') || overview.href)
        a.textContent = span.textContent
        span.parentNode.replaceChild(a, span)
      })
    } catch (e) {
      /* breadcrumbs stay plain text */
    }
  }

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
    if (navDepth(li) === 0) expandForestRootSections(li)

    var overviewPath = normalizeHref(overview.getAttribute('href') || overview.href)
    var onOverviewPage = overviewPath && overviewPath === currentPathname()

    if (link) {
      if (link === overview || normalizeHref(link.getAttribute('href')) === overviewPath) {
        if (onOverviewPage) e.preventDefault()
        persistMenu(menu)
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
  window.siteNavTreePickBestCurrentPageItem = pickBestCurrentPageItem
  window.siteNavTreeComponentRootHref = componentRootHref
  window.siteNavTreeExpandForestRootSections = expandForestRootSections
  window.siteNavTreeFindForestOwnerRootForPath = findForestOwnerRootForPath
  window.siteNavTreeMarkOverviewLabels = markOverviewLabels
  window.siteNavTreeLinkifyBreadcrumbs = linkifyBreadcrumbSectionCrumbs
  window.siteNavTreeAbsolutizeNavHrefs = absolutizeNavLinkHrefs
  window.siteNavTreePrepareNavMenu = prepareNavMenu
  window.siteNavTreeResolveNavLink = resolveNavLinkUrl
  window.siteNavTreeNavLinkPathname = navLinkPathname
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
  hydrate404Nav()

  function beforeNav () {
    flushNavScroll()
    prepareNavMenu(document.querySelector('.nav-container [data-panel=menu]'))
  }

  function afterNav (detail) {
    detail = detail || {}
    if (detail.url && typeof markCurrentByPath === 'function') {
      try {
        markCurrentByPath(detail.url)
      } catch (e) {
        /* ignore */
      }
    }
    siteNavTreeCurrent()
    bindPanelScroll()
    restoreNavScroll()
  }

  var navSignals =
    typeof SoftNavSignals !== 'undefined'
      ? SoftNavSignals
      : typeof SoftNavContext !== 'undefined' && SoftNavContext.signals
        ? SoftNavContext.signals
        : null
  if (navSignals) {
    navSignals.subscribe('pageUrl', function (url) {
      if (url && typeof markCurrentByPath === 'function') {
        try {
          markCurrentByPath(url)
        } catch (e) {
          /* ignore */
        }
      }
    })
  }

  if (typeof bindSoftNavContext === 'function') {
    bindSoftNavContext({
      onBefore: beforeNav,
      onLoaded: afterNav,
    })
  } else {
    function onSoftNavLoaded (fn) {
      if (window.SoftNav && typeof SoftNav.on === 'function') SoftNav.on('loaded', fn)
      else document.addEventListener('soft-nav:loaded', function (e) { fn(e.detail || {}) })
    }
    function onSoftNavBefore (fn) {
      if (window.SoftNav && typeof SoftNav.on === 'function') SoftNav.on('before', fn)
      else document.addEventListener('soft-nav:before', function (e) { fn(e.detail || {}) })
    }
    onSoftNavBefore(beforeNav)
    onSoftNavLoaded(afterNav)
  }
})()