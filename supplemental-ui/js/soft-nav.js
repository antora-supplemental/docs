/**
 * SoftNav — same-origin soft navigation bus for Antora UI chrome.
 *
 * Intercepts in-article links within the same Antora component, fetches the
 * next page, swaps registered regions (mast / side nav / article), then emits
 * lifecycle events so consumers rebind without SoftNav naming them.
 *
 * Cross-component links do a full document load.
 *
 * Public API:
 *   SoftNav.on('before'|'loaded'|'failed', handler) -> unsubscribe
 *   SoftNav.registerRegion({ id, extract(doc), apply(fresh, ctx) })
 *   SoftNav.navigate(url)
 *   SoftNav.transition = 'crossfade' | 'none'
 *
 * DOM events (detail = ctx): soft-nav:before | soft-nav:loaded | soft-nav:failed
 * Compat: also fires doc-nav:loaded on successful swaps.
 */
;(function (global) {
  'use strict'

  var FADE_MS = 180
  var listeners = { before: [], loaded: [], failed: [] }
  var regions = Object.create(null)

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

  var SoftNav = {
    transition: 'crossfade',
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
  }

  function pageUrl (url) {
    return new URL(url, window.location.href)
  }

  function sameOrigin (url) {
    try {
      return pageUrl(url).origin === window.location.origin
    } catch (e) {
      return false
    }
  }

  function samePath (url) {
    try {
      return pageUrl(url).pathname === window.location.pathname
    } catch (e) {
      return false
    }
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
      if (!fresh) return
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
      var scrollY = window.scrollY
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
        window.scrollTo(0, scrollY)
        ctx.articleHost = articleHost
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
    var order = ['mast', 'nav', 'article']
    var i
    for (i = 0; i < order.length; i++) {
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
        document.title = extractTitle(doc)
        applyRegions(doc, ctx)
      })
      .catch(function (err) {
        emit('failed', { url: dest, error: err })
        window.location.href = dest
      })
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
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return
    if (a.closest('.nav-container')) return
    var href = a.getAttribute('href')
    if (!href || href.charAt(0) === '#') return
    if (!sameOrigin(a.href) || samePath(a.href)) return
    if (!sameComponent(a.href)) return
    ev.preventDefault()
    navigate(a.href, true)
  })

  window.addEventListener('popstate', function () {
    navigate(window.location.href, false)
  })

  if (!history.state || !(history.state.softNav || history.state.docNav)) {
    history.replaceState({ softNav: true, docNav: true }, '', window.location.href)
  }
})(window)