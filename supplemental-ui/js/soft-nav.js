/**
 * SoftNav — same-origin soft navigation for Antora UI chrome.
 *
 * Swaps mast + article by default; keeps the left nav tree stable (swapNav=false).
 * Rebuilds aside page TOC, scrolls to top on cross-page loads, injects nav-hidden
 * children under their parent in the nav tree.
 *
 * Public API:
 *   SoftNav.swapNav — replace left nav panel from fetched doc (default false)
 *   SoftNav.scrollToTop — scroll window to top on cross-page nav (default true)
 *   SoftNav.on('before'|'loaded'|'failed', handler)
 *   SoftNav.registerRegion({ id, extract(doc), apply(fresh, ctx) })
 *   SoftNav.navigate(url)
 *   SoftNav.rebuildPageToc()
 *   SoftNav.syncNavForCurrentPage(doc?)
 */
;(function (global) {
  'use strict'

  var FADE_MS = 180
  var listeners = { before: [], loaded: [], failed: [] }
  var regions = Object.create(null)
  var tocScrollHandler = null

  var SoftNav = {
    transition: 'crossfade',
    swapNav: false,
    scrollToTop: true,
    on: function (event, handler) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(handler)
      return function unsubscribe () {
        var list = listeners[event]
        if (!list) return
        var i = list.indexOf(handler)
        if (i >= 0) list.splice(i, 1)
      }
    },
    registerRegion: function (spec) {
      if (!spec || !spec.id || typeof spec.extract !== 'function' || typeof spec.apply !== 'function') {
        throw new Error('SoftNav.registerRegion requires { id, extract, apply }')
      }
      regions[spec.id] = spec
      return SoftNav
    },
    navigate: function (url) {
      return navigate(url, true)
    },
    rebuildPageToc: rebuildPageToc,
    syncNavForCurrentPage: function (doc) {
      syncNavAfterNavigate(window.location.href, doc || document)
    },
  }

  function emit (event, detail) {
    var list = listeners[event] || []
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](detail)
      } catch (err) {
        console.warn('[soft-nav] listener error on ' + event, err)
      }
    }
    document.dispatchEvent(new CustomEvent('soft-nav:' + event, { detail: detail }))
    if (event === 'loaded') {
      document.dispatchEvent(new CustomEvent('doc-nav:loaded', { detail: detail }))
    }
  }

  function pageUrl (url, base) {
    return new URL(url, base || window.location.href)
  }

  function sameOrigin (url) {
    try {
      return pageUrl(url).origin === window.location.origin
    } catch (e) {
      return false
    }
  }

  function normalizePathname (path) {
    if (!path || path === '/') return '/'
    var p = path.replace(/\/index\.html$/i, '/')
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1)
    return p
  }

  function pathKey (url) {
    return normalizePathname(pageUrl(url).pathname)
  }

  function samePath (url) {
    try {
      return pathKey(url) === pathKey(window.location.href)
    } catch (e) {
      return false
    }
  }

  function scrollToHash (hash) {
    var raw = hash || window.location.hash
    if (!raw || raw.charAt(0) !== '#') return
    var id = decodeURIComponent(raw.slice(1))
    if (!id) return
    var el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ block: 'start', behavior: 'auto' })
  }

  function componentName (url) {
    try {
      var parts = pageUrl(url).pathname.split('/').filter(Boolean)
      return parts[0] || ''
    } catch (e) {
      return ''
    }
  }

  function sameComponent (url) {
    return componentName(url) === componentName(window.location.href)
  }

  function navLinkMatchesPath (linkHref, targetUrl) {
    if (!linkHref || linkHref.charAt(0) === '#') return false
    try {
      var linkPath = pathKey(pageUrl(linkHref, targetUrl))
      var targetPath = pathKey(targetUrl)
      return linkPath === targetPath
    } catch (e) {
      return false
    }
  }

  function absolutize (rootEl, destHref) {
    if (!rootEl) return
    var base = pageUrl(destHref)
    ;['href', 'src'].forEach(function (attr) {
      ;[].forEach.call(rootEl.querySelectorAll('[' + attr + ']'), function (el) {
        var raw = el.getAttribute(attr)
        if (!raw || raw.charAt(0) === '#' || raw.indexOf('mailto:') === 0 || raw.indexOf('javascript:') === 0) {
          return
        }
        try {
          el.setAttribute(attr, new URL(raw, base).href)
        } catch (e) {
          /* leave as-is */
        }
      })
    })
  }

  function bindBreadcrumbDropdowns (scope) {
    if (!scope) return
    ;[].forEach.call(scope.querySelectorAll('.adt-bc-dropdown'), function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation()
      })
    })
    ;[].forEach.call(scope.querySelectorAll('[data-adt-toggle]'), function (button) {
      if (button.getAttribute('data-adt-bound')) return
      button.setAttribute('data-adt-bound', '1')
      var id = button.getAttribute('data-adt-toggle')
      if (!id) return
      var list = document.getElementById(id)
      if (!list) return
      button.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        var isHidden = list.hasAttribute('hidden')
        ;[].forEach.call(document.querySelectorAll('.adt-bc-dropdown'), function (dd) {
          if (dd === list) return
          dd.setAttribute('hidden', 'hidden')
        })
        ;[].forEach.call(document.querySelectorAll('[data-adt-toggle]'), function (b) {
          b.setAttribute('aria-expanded', 'false')
        })
        if (isHidden) {
          list.removeAttribute('hidden')
          button.setAttribute('aria-expanded', 'true')
        } else {
          list.setAttribute('hidden', 'hidden')
          button.setAttribute('aria-expanded', 'false')
        }
      })
    })
  }

  function extractTitle (doc) {
    var t = doc.querySelector('title')
    return t ? t.textContent : document.title
  }

  function readPageNavMeta (doc) {
    var root = doc && doc.querySelector ? doc : document
    var hidden = root.querySelector('meta[name="antora-supplemental:nav-hidden"]')
    var parent = root.querySelector('meta[name="antora-supplemental:nav-parent"]')
    return {
      navHidden: !!hidden,
      navParent: parent && parent.getAttribute('content') ? parent.getAttribute('content').trim() : null,
    }
  }

  function inferNavParentSlug (pathname) {
    var parts = pathname.split('/').filter(Boolean)
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i]
      if (seg.endsWith('-details')) return seg.slice(0, -8)
    }
    return null
  }

  function parentSlugFromMeta (meta, pathname) {
    if (meta.navParent) {
      var s = meta.navParent.replace(/\.adoc$/i, '').replace(/^\.\//, '')
      var base = s.split('/').pop()
      return base || s
    }
    return inferNavParentSlug(pathname)
  }

  function findParentNavItem (menu, parentSlug, baseUrl) {
    var links = menu.querySelectorAll('a.nav-link')
    for (var i = 0; i < links.length; i++) {
      var a = links[i]
      var href = a.getAttribute('href')
      if (!href) continue
      try {
        var p = pathKey(pageUrl(href, baseUrl))
        var segments = p.split('/').filter(Boolean)
        var last = segments[segments.length - 1] || ''
        if (last === parentSlug || p.endsWith('/' + parentSlug)) return a.closest('li.nav-item')
      } catch (e) {
        continue
      }
    }
    return null
  }

  function pageLabelFromDoc (doc) {
    var root = doc && doc.querySelector ? doc : document
    var article = root.querySelector('article.doc')
    if (article) {
      var h2 = article.querySelector('.sect1 > h2[id], h2[id]')
      if (h2 && h2.textContent) return h2.textContent.trim()
      var h1 = article.querySelector('h1.page, h1[id].sect0')
      if (h1 && h1.textContent) return h1.textContent.trim()
    }
    var t = root.querySelector('title')
    return t ? t.textContent.replace(/\s*::.*$/, '').trim() : document.title
  }

  function removeInjectedNavHidden (menu) {
    ;[].forEach.call(menu.querySelectorAll('.nav-item.nav-hidden-injected'), function (el) {
      el.parentNode.removeChild(el)
    })
  }

  function syncNavAfterNavigate (url, fetchedDoc) {
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu) return

    removeInjectedNavHidden(menu)
    ;[].forEach.call(menu.querySelectorAll('.nav-item.is-current-page'), function (el) {
      el.classList.remove('is-current-page')
    })

    var meta = readPageNavMeta(fetchedDoc || document)
    var pathname = pageUrl(url).pathname
    var parentSlug = parentSlugFromMeta(meta, pathname)
    var treatAsHidden = meta.navHidden || (parentSlug && pathname.indexOf('-details') >= 0)

    if (treatAsHidden && parentSlug) {
      var parentItem = findParentNavItem(menu, parentSlug, url)
      if (parentItem) {
        var depth = (parseInt(parentItem.getAttribute('data-depth'), 10) || 0) + 1
        var list = parentItem.querySelector(':scope > ul.nav-list')
        if (!list) {
          list = document.createElement('ul')
          list.className = 'nav-list'
          parentItem.appendChild(list)
        }
        parentItem.classList.add('is-active', 'is-current-path')
        var li = document.createElement('li')
        li.className = 'nav-item nav-hidden-injected is-current-page is-active'
        li.setAttribute('data-depth', String(depth))
        var link = document.createElement('a')
        link.className = 'nav-link'
        link.href = url
        link.textContent = pageLabelFromDoc(fetchedDoc || document)
        li.appendChild(link)
        list.appendChild(li)
        if (typeof global.siteNavTreeCurrent === 'function') global.siteNavTreeCurrent()
        return
      }
    }

    ;[].forEach.call(menu.querySelectorAll('a.nav-link'), function (a) {
      if (navLinkMatchesPath(a.getAttribute('href'), url)) {
        var item = a.closest('li.nav-item')
        if (item) item.classList.add('is-current-page')
      }
    })
    if (typeof global.siteNavTreeCurrent === 'function') global.siteNavTreeCurrent()
  }

  function parsePx (el, prop) {
    return parseFloat(window.getComputedStyle(el)[prop])
  }

  function rebuildPageToc () {
    var aside = document.querySelector('aside.toc.sidebar')
    if (!aside) return
    if (document.querySelector('body.-toc')) {
      if (aside.parentNode) aside.parentNode.removeChild(aside)
      return
    }

    var levels = parseInt(aside.dataset.levels || '2', 10)
    if (levels < 0) return

    var articleSel = 'article.doc'
    var article = document.querySelector(articleSel)
    if (!article) return

    var selectors = []
    for (var i = 0; i <= levels; i++) {
      var parts = [articleSel]
      if (i) {
        for (var c = 1; c <= i; c++) {
          parts.push(c === 2 ? '.sectionbody>' : '')
          parts.push('.sect' + c)
        }
        parts.push('h' + (i + 1) + '[id]' + (i > 1 ? ':not(.discrete)' : ''))
      } else {
        parts.push('h1[id].sect0')
      }
      selectors.push(parts.filter(Boolean).join('>'))
    }

    var query = selectors.join(',')
    var scope = article.parentNode || document
    var headings = [].slice.call(scope.querySelectorAll(query))
    if (!headings.length) {
      if (aside.parentNode) aside.parentNode.removeChild(aside)
      return
    }

    var linkByHash = {}
    var list = headings.reduce(function (ul, heading) {
      var a = document.createElement('a')
      a.textContent = heading.textContent
      var href = '#' + heading.id
      a.setAttribute('href', href)
      linkByHash[href] = a
      var li = document.createElement('li')
      li.dataset.level = String(parseInt(heading.nodeName.slice(1), 10) - 1)
      li.appendChild(a)
      ul.appendChild(li)
      return ul
    }, document.createElement('ul'))

    var menu = aside.querySelector('.toc-menu')
    if (!menu) {
      menu = document.createElement('div')
      menu.className = 'toc-menu'
      aside.appendChild(menu)
    }
    menu.innerHTML = ''
    var title = document.createElement('h3')
    title.textContent = aside.dataset.title || 'Contents'
    menu.appendChild(title)
    menu.appendChild(list)

    if (tocScrollHandler) {
      window.removeEventListener('scroll', tocScrollHandler)
      tocScrollHandler = null
    }

    var tocList = menu.querySelector('ul')
    var activeStack
    var topOffset = article.getBoundingClientRect().top + window.pageYOffset
    var fontSize = parsePx(document.documentElement, 'fontSize') * 1.15

    tocScrollHandler = function () {
      var scrollY = window.pageYOffset
      var atBottom =
        scrollY && window.innerHeight + scrollY + 2 >= document.documentElement.scrollHeight

      if (atBottom) {
        activeStack = Array.isArray(activeStack) ? activeStack : Array(activeStack || 0)
        var visible = []
        var last = headings.length - 1
        headings.forEach(function (h, idx) {
          var hash = '#' + h.id
          if (
            idx === last ||
            h.getBoundingClientRect().top + parsePx(h, 'paddingTop') > topOffset
          ) {
            visible.push(hash)
            if (activeStack.indexOf(hash) < 0) linkByHash[hash].classList.add('is-active')
          } else if (~activeStack.indexOf(hash)) {
            linkByHash[activeStack.shift()].classList.remove('is-active')
          }
        })
        activeStack = visible.length > 1 ? visible : visible[0]
        return
      }

      if (Array.isArray(activeStack)) {
        activeStack.forEach(function (hash) {
          linkByHash[hash].classList.remove('is-active')
        })
        activeStack = undefined
      }

      var current
      headings.some(function (h) {
        if (h.getBoundingClientRect().top + parsePx(h, 'paddingTop') - fontSize > topOffset) {
          return true
        }
        current = '#' + h.id
      })

      if (current) {
        if (current !== activeStack) {
          if (activeStack) linkByHash[activeStack].classList.remove('is-active')
          var link = linkByHash[current]
          link.classList.add('is-active')
          if (tocList.scrollHeight > tocList.offsetHeight) {
            tocList.scrollTop = Math.max(0, link.offsetTop + link.offsetHeight - tocList.offsetHeight)
          }
          activeStack = current
        }
      } else if (activeStack) {
        linkByHash[activeStack].classList.remove('is-active')
        activeStack = undefined
      }
    }

    window.addEventListener('scroll', tocScrollHandler, { passive: true })
    tocScrollHandler()
  }

  function finishPageTransition (ctx) {
    var dest = pageUrl(ctx.url)
    if (dest.hash) scrollToHash(dest.hash)
    else if (SoftNav.scrollToTop !== false) window.scrollTo(0, 0)

    rebuildPageToc()
    syncNavAfterNavigate(ctx.url, ctx.doc)
  }

  SoftNav.registerRegion({
    id: 'mast',
    extract: function (doc) {
      return doc.querySelector('.adt-doc-mast-center') || doc.querySelector('nav.breadcrumbs')
    },
    apply: function (fresh, ctx) {
      var host = document.querySelector('.adt-doc-mast-center')
      if (!host) host = document.querySelector('nav.breadcrumbs')
      if (!host || !fresh) return
      var node = document.importNode(fresh, true)
      absolutize(node, ctx.url)
      host.replaceWith(node)
      bindBreadcrumbDropdowns(node)
    },
  })

  SoftNav.registerRegion({
    id: 'nav',
    extract: function (doc) {
      return doc.querySelector('.nav-container [data-panel=menu]')
    },
    apply: function (fresh, ctx) {
      if (!fresh || !SoftNav.swapNav) return
      var panel = document.querySelector('.nav-container [data-panel=menu]')
      if (!panel) return
      var node = document.importNode(fresh, true)
      absolutize(node, ctx.url)
      panel.innerHTML = ''
      while (node.firstChild) panel.appendChild(node.firstChild)
    },
  })

  SoftNav.registerRegion({
    id: 'article',
    extract: function (doc) {
      return (
        doc.querySelector('main.article .content') ||
        doc.querySelector('main.article') ||
        doc.querySelector('article.doc')
      )
    },
    apply: function (fresh, ctx) {
      var articleHost =
        document.querySelector('main.article .content') ||
        document.querySelector('main.article') ||
        document.querySelector('article.doc')
      if (!articleHost || !fresh) {
        window.location.href = ctx.url
        return
      }
      var node = document.importNode(fresh, true)
      absolutize(node, ctx.url)
      var fade = SoftNav.transition !== 'none'
      function commit () {
        articleHost.innerHTML = ''
        while (node.firstChild) articleHost.appendChild(node.firstChild)
        if (fade) {
          articleHost.style.opacity = '1'
          window.setTimeout(function () {
            articleHost.style.transition = ''
          }, FADE_MS)
        }
        ctx.articleHost = articleHost
        finishPageTransition(ctx)
        emit('loaded', ctx)
      }
      if (fade) {
        articleHost.style.transition = 'opacity ' + FADE_MS + 'ms ease'
        articleHost.style.opacity = '0'
        window.setTimeout(commit, FADE_MS)
      } else {
        commit()
      }
    },
  })

  function applyRegions (doc, ctx) {
    var order = SoftNav.swapNav ? ['mast', 'nav', 'article'] : ['mast', 'article']
    for (var i = 0; i < order.length; i++) {
      var id = order[i]
      var spec = regions[id]
      if (!spec) continue
      var fresh = spec.extract(doc)
      if (id === 'article' && !fresh) throw new Error('no article')
      spec.apply(fresh, ctx)
    }
    Object.keys(regions).forEach(function (id) {
      if (order.indexOf(id) >= 0) return
      var spec = regions[id]
      spec.apply(spec.extract(doc), ctx)
    })
  }

  function navigate (url, push) {
    var dest = pageUrl(url).href
    var ctx = { url: dest, push: !!push }
    emit('before', ctx)
    return fetch(dest, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed')
        return res.text()
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html')
        ctx.doc = doc
        if (push) history.pushState({ softNav: true, docNav: true }, '', dest)
        lastPopPath = normalizePathname(pageUrl(dest).pathname) + pageUrl(dest).search
        document.title = extractTitle(doc)
        applyRegions(doc, ctx)
      })
      .catch(function (err) {
        emit('failed', { url: dest, error: err })
        window.location.href = dest
      })
  }

  function handleLinkClick (ev, a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false
    if (!sameOrigin(a.href)) return false
    var dest = pageUrl(a.href)
    if (samePath(dest.href)) {
      if (dest.hash) {
        ev.preventDefault()
        scrollToHash(dest.hash)
        if (dest.href !== window.location.href) {
          history.pushState(history.state || { softNav: true, docNav: true }, '', dest.href)
        }
      }
      return true
    }
    if (!sameComponent(a.href)) return false
    ev.preventDefault()
    navigate(a.href, true)
    return true
  }

  global.SoftNav = SoftNav

  var root = document.querySelector('.body')
  var articleHost =
    document.querySelector('main.article .content') ||
    document.querySelector('main.article') ||
    document.querySelector('article.doc')
  if (!root || !articleHost) return

  root.addEventListener('click', function (ev) {
    var a = ev.target.closest('a')
    if (!a) return
    if (a.closest('.nav-container')) {
      handleLinkClick(ev, a)
      return
    }
    handleLinkClick(ev, a)
  })

  var lastPopPath = normalizePathname(window.location.pathname) + window.location.search

  window.addEventListener('popstate', function () {
    var pathKeyNow = normalizePathname(window.location.pathname) + window.location.search
    if (pathKeyNow === lastPopPath) {
      scrollToHash()
      return
    }
    lastPopPath = pathKeyNow
    navigate(window.location.href, false)
  })

  if (!history.state || !(history.state.softNav || history.state.docNav)) {
    history.replaceState({ softNav: true, docNav: true }, '', window.location.href)
  }

  function onInitialReady () {
    rebuildPageToc()
    syncNavAfterNavigate(window.location.href, document)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onInitialReady)
  } else {
    onInitialReady()
  }
})(window)
